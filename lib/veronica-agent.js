import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { askGhlAssistant } from "../ghl-assistant.js";

const WORKFLOWS_DIR = path.join(process.cwd(), "workflows");
const CONTEXT7_API_KEY = process.env.CONTEXT7_API_KEY;
const CONTEXT7_API_URL = process.env.CONTEXT7_API_URL || "https://context7.com/api";

function hasAny(text, tokens) {
  const normalized = (text || "").toLowerCase();
  return tokens.some((token) => normalized.includes(token));
}

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || stdout || `${command} failed`));
      }
    });
  });
}

function detectNotebookId(output) {
  const match = output.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match ? match[0] : null;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function getTemplateNodes(workflow) {
  return toArray(workflow?.rawJson?.workflow_json?.workflowData?.templates);
}

function getTriggerNodes(workflow) {
  const triggerRoot = workflow?.rawJson?.trigger_json;
  if (!triggerRoot) return [];
  if (Array.isArray(triggerRoot)) return triggerRoot;
  if (Array.isArray(triggerRoot.triggers)) return triggerRoot.triggers;
  if (Array.isArray(triggerRoot.data)) return triggerRoot.data;
  return [triggerRoot];
}

function extractNextIds(nextValue) {
  if (!nextValue) return [];
  if (Array.isArray(nextValue)) return nextValue.filter(Boolean);
  if (typeof nextValue === "string") return [nextValue];
  return [];
}

function buildWorkflowStats(workflow) {
  const nodes = getTemplateNodes(workflow);
  const triggers = getTriggerNodes(workflow);
  const actionCounts = {};
  let edges = 0;
  const idSet = new Set();
  const hasParent = new Set();

  for (const node of nodes) {
    const type = node?.type || node?.cat || "unknown";
    actionCounts[type] = (actionCounts[type] || 0) + 1;
    if (node?.id) idSet.add(node.id);
    if (node?.parent) hasParent.add(node.id);
    edges += extractNextIds(node?.next).length;
  }

  const roots = nodes.filter((node) => node?.id && !hasParent.has(node.id));
  const rootIds = roots.map((node) => node.id);
  const adjacency = new Map();
  for (const node of nodes) {
    if (!node?.id) continue;
    adjacency.set(node.id, extractNextIds(node.next));
  }

  const reachable = new Set();
  const stack = [...rootIds];
  while (stack.length) {
    const current = stack.pop();
    if (!current || reachable.has(current)) continue;
    reachable.add(current);
    const nextIds = adjacency.get(current) || [];
    for (const next of nextIds) stack.push(next);
  }

  const orphanCount = nodes.filter((node) => node?.id && !reachable.has(node.id)).length;
  const triggerTypes = triggers
    .map((trigger) => trigger?.type || trigger?.event || trigger?.triggerType || "unknown")
    .filter(Boolean);

  return {
    nodeCount: nodes.length,
    edgeCount: edges,
    orphanCount,
    triggerCount: triggers.length,
    triggerTypes,
    actionCounts,
    status: workflow?.rawJson?.workflow_json?.status || "unknown",
  };
}

function rankTopActions(actionCounts, maxItems = 5) {
  return Object.entries(actionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxItems)
    .map(([type, count]) => `${type} (${count})`)
    .join(", ");
}

function summarizeNodeLabel(node) {
  const name = node?.name || "Unnamed";
  const type = node?.type || node?.cat || "unknown";
  return `${name} [${type}]`;
}

function getRootNodes(nodes) {
  const childIds = new Set(nodes.map((node) => node?.id).filter(Boolean));
  const hasParent = new Set(
    nodes
      .map((node) => node?.parent)
      .filter((id) => id && childIds.has(id))
  );
  return nodes.filter((node) => node?.id && !hasParent.has(node.id));
}

function buildChainMap(workflow, maxDepth = 6, maxBranches = 3) {
  const nodes = getTemplateNodes(workflow);
  if (!nodes.length) return "No nodes available";

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const roots = getRootNodes(nodes).slice(0, maxBranches);

  const lines = [];
  const visitedGlobal = new Set();

  function walk(nodeId, depth, prefix) {
    if (!nodeId || depth > maxDepth) return;
    const node = byId.get(nodeId);
    if (!node) return;

    const marker = depth === 0 ? "START" : "->";
    lines.push(`${prefix}${marker} ${summarizeNodeLabel(node)}`);

    const nextIds = extractNextIds(node.next).slice(0, maxBranches);
    for (const nextId of nextIds) {
      if (visitedGlobal.has(`${nodeId}:${nextId}`)) continue;
      visitedGlobal.add(`${nodeId}:${nextId}`);
      walk(nextId, depth + 1, `${prefix}   `);
    }
  }

  if (!roots.length && nodes[0]?.id) {
    walk(nodes[0].id, 0, "");
  } else {
    for (const root of roots) {
      walk(root.id, 0, "");
    }
  }

  return lines.join("\n");
}

function classifyPathType(node) {
  const type = (node?.type || "").toLowerCase();
  const name = (node?.name || "").toLowerCase();

  const happyTokens = ["sms", "email", "create_opportunity", "add_contact_tag", "assign_user"];
  const failureTokens = ["if_else", "wait", "remove", "stop", "unsubscribe", "dnd"];

  if (happyTokens.some((token) => type.includes(token) || name.includes(token))) return "happy";
  if (failureTokens.some((token) => type.includes(token) || name.includes(token))) return "failure";
  return "neutral";
}

function buildPathSummary(workflow) {
  const nodes = getTemplateNodes(workflow);
  if (!nodes.length) {
    return {
      happy: "No execution steps found.",
      failure: "No execution steps found.",
    };
  }

  const happySteps = [];
  const failureSteps = [];

  for (const node of nodes) {
    const classification = classifyPathType(node);
    const label = summarizeNodeLabel(node);
    if (classification === "happy" && happySteps.length < 6) {
      happySteps.push(label);
    }
    if (classification === "failure" && failureSteps.length < 6) {
      failureSteps.push(label);
    }
  }

  return {
    happy: happySteps.length
      ? `✅ Happy Path: ${happySteps.join(" -> ")}`
      : "✅ Happy Path: No obvious customer-delivery path detected.",
    failure: failureSteps.length
      ? `⚠️ Failure/Edge Path: ${failureSteps.join(" -> ")}`
      : "⚠️ Failure/Edge Path: No explicit failure branch markers detected.",
  };
}

async function queryContext7(question, workflow) {
  if (!CONTEXT7_API_KEY) return null;

  try {
    const searchUrl = new URL(`${CONTEXT7_API_URL.replace(/\/$/, "")}/v2/libs/search`);
    searchUrl.searchParams.set("libraryName", "gohighlevel");
    searchUrl.searchParams.set("query", question);

    const searchRes = await fetch(searchUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${CONTEXT7_API_KEY}`,
      },
    });

    if (!searchRes.ok) {
      return `Context7 search failed (${searchRes.status}).`;
    }

    const searchData = await searchRes.json();
    const libraries = Array.isArray(searchData) ? searchData : searchData?.results || [];
    const chosenLibrary = libraries[0];

    if (!chosenLibrary?.id) {
      return "Context7 se relevant GoHighLevel library match nahi mila.";
    }

    const contextUrl = new URL(`${CONTEXT7_API_URL.replace(/\/$/, "")}/v2/context`);
    contextUrl.searchParams.set("libraryId", chosenLibrary.id);
    contextUrl.searchParams.set(
      "query",
      `${question}. Workflow: ${workflow.workflowName}. Trigger present: ${workflow.triggerPresent}`
    );
    contextUrl.searchParams.set("type", "txt");

    const contextRes = await fetch(contextUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${CONTEXT7_API_KEY}`,
      },
    });

    if (!contextRes.ok) {
      return `Context7 context fetch failed (${contextRes.status}).`;
    }

    const contextText = await contextRes.text();
    return `Context7 external insights:\n${contextText.slice(0, 1500)}`;
  } catch (error) {
    return `Context7 unavailable: ${error.message}`;
  }
}

export async function getContext7Status() {
  if (!CONTEXT7_API_KEY) {
    return "Context7 status: API key missing in `.env`.";
  }

  try {
    const searchUrl = new URL(`${CONTEXT7_API_URL.replace(/\/$/, "")}/v2/libs/search`);
    searchUrl.searchParams.set("libraryName", "gohighlevel");
    searchUrl.searchParams.set("query", "workflow automation");

    const res = await fetch(searchUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${CONTEXT7_API_KEY}`,
      },
    });

    if (!res.ok) {
      return `Context7 status: reachable but request failed with ${res.status}. Base URL in use: ${CONTEXT7_API_URL}`;
    }

    const data = await res.json();
    const libraries = Array.isArray(data) ? data : data?.results || [];
    return `Context7 status: connected. Base URL: ${CONTEXT7_API_URL}. Library matches found: ${libraries.length}.`;
  } catch (error) {
    return `Context7 status: connection failed. Base URL: ${CONTEXT7_API_URL}. Error: ${error.message}`;
  }
}

export async function loadWorkflowCatalog() {
  let fileNames = [];
  try {
    fileNames = (await fs.readdir(WORKFLOWS_DIR)).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }

  const workflows = [];
  for (const fileName of fileNames) {
    const fullPath = path.join(WORKFLOWS_DIR, fileName);
    try {
      const raw = await fs.readFile(fullPath, "utf-8");
      const json = JSON.parse(raw);
      workflows.push({
        fileName,
        fullPath,
        workflowName: json.workflow_name || fileName.replace(".json", ""),
        workflowId: json.workflow_id || "unknown",
        triggerPresent: Boolean(json.trigger_json),
        hasWorkflowJson: Boolean(json.workflow_json),
        rawJson: json,
      });
    } catch {
      // Ignore malformed files and continue.
    }
  }

  return workflows;
}

function pickWorkflowByMessage(workflows, message, workflowName) {
  if (!workflows.length) return null;
  const normalize = (input) => String(input || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const explicit = (workflowName || "").trim().toLowerCase();
  if (explicit) {
    const byName = workflows.find((wf) => wf.workflowName.toLowerCase().includes(explicit));
    if (byName) return byName;
  }

  const text = normalize(message);
  const direct = workflows.find((wf) => text.includes(normalize(wf.workflowName)));
  if (direct) return direct;

  return (
    workflows.find((wf) => {
      const tokens = normalize(wf.workflowName).split(" ").filter((token) => token.length >= 4);
      if (!tokens.length) return false;
      const matches = tokens.filter((token) => text.includes(token)).length;
      return matches >= Math.min(2, tokens.length);
    }) || null
  );
}

export async function explainExistingWorkflows() {
  const workflows = await loadWorkflowCatalog();
  if (!workflows.length) {
    return "Mujhe `workflows/` folder mein koi JSON workflow nahi mila. Pehle Echo se export karwao, phir main one-by-one explain kar dunga.";
  }

  const lines = workflows.slice(0, 25).map((wf, index) => {
    const triggerState = wf.triggerPresent ? "trigger captured" : "trigger missing";
    return `${index + 1}. ${wf.workflowName} (${triggerState})`;
  });

  const suffix =
    workflows.length > 25 ? `\n...and ${workflows.length - 25} more workflows.` : "";

  return [
    `Maine ${workflows.length} workflows detect kiye hain:`,
    lines.join("\n"),
    suffix,
    "",
    "Agar chaho to main in sab ko NotebookLM notebook mein daal kar slides, infographic, ya audio overview generate karwa sakti hoon. Bas format batao.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateEndToEndWorkflowReport(mode = "deep") {
  const workflows = await loadWorkflowCatalog();
  if (!workflows.length) {
    return "End-to-end report ke liye `workflows/` folder mein exported JSON files chahiye.";
  }

  const stats = workflows.map((workflow) => ({
    workflow,
    stats: buildWorkflowStats(workflow),
  }));

  const published = stats.filter((entry) => entry.stats.status === "published").length;
  const missingTriggers = stats.filter((entry) => !entry.workflow.triggerPresent).length;
  const orphaned = stats.filter((entry) => entry.stats.orphanCount > 0).length;
  const totalNodes = stats.reduce((sum, entry) => sum + entry.stats.nodeCount, 0);

  const actionTotals = {};
  for (const entry of stats) {
    for (const [type, count] of Object.entries(entry.stats.actionCounts)) {
      actionTotals[type] = (actionTotals[type] || 0) + count;
    }
  }

  const perWorkflow = stats
    .map((entry, index) => {
      const topActions = rankTopActions(entry.stats.actionCounts, 4) || "No actions detected";
      const triggers = entry.stats.triggerTypes.slice(0, 3).join(", ") || "unknown";
      const pathSummary = buildPathSummary(entry.workflow);
      const chainMap = buildChainMap(entry.workflow);
      return `${index + 1}. ${entry.workflow.workflowName}
   - status: ${entry.stats.status}
   - triggers: ${entry.stats.triggerCount} (${triggers})
   - nodes: ${entry.stats.nodeCount}, edges: ${entry.stats.edgeCount}, orphans: ${entry.stats.orphanCount}
   - dominant steps: ${topActions}
   - ${pathSummary.happy}
   - ${pathSummary.failure}
   - chain map:
${chainMap
  .split("\n")
  .map((line) => `     ${line}`)
  .join("\n")}`;
    })
    .join("\n");

  const topSystemActions = rankTopActions(actionTotals, 8);

  if (mode === "brief") {
    const topRiskWorkflows = stats
      .filter((entry) => !entry.workflow.triggerPresent || entry.stats.status !== "published")
      .slice(0, 5)
      .map(
        (entry, index) =>
          `${index + 1}. ${entry.workflow.workflowName} (status: ${entry.stats.status}, triggers: ${entry.stats.triggerCount})`
      )
      .join("\n");

    return `Brief Analyzer Report

Executive snapshot:
- Total workflows: ${workflows.length}
- Published workflows: ${published}
- Missing trigger exports: ${missingTriggers}
- Workflows with orphan nodes: ${orphaned}
- Total automation nodes: ${totalNodes}
- Top automation actions: ${topSystemActions || "No actions detected"}

Top workflows needing review:
${topRiskWorkflows || "No critical risk workflows detected."}

Priority next actions:
1) Export/fix missing trigger JSON for all workflows.
2) Standardize repeated branching patterns.
3) Audit draft workflows before production use.
4) Run deep analyzer report for full technical mapping.`;
  }

  return `End-to-End Workflow Analyzer Report

System overview:
- Total workflows: ${workflows.length}
- Published workflows: ${published}
- Missing trigger exports: ${missingTriggers}
- Workflows with orphan nodes: ${orphaned}
- Total automation nodes across system: ${totalNodes}
- Most used automation actions: ${topSystemActions || "No actions detected"}

Workflow-by-workflow analysis:
${perWorkflow}

How automation is being handled right now:
- New leads/events are split into multiple specialized workflows.
- Branching logic (if/else) is heavily used to route contacts into different paths.
- Communication + CRM updates are driven through repeated action blocks (SMS/email/tag/opportunity updates).
- Trigger completeness is critical: workflows with missing trigger export data are a blind spot for debugging.

Recommended next actions:
1) Fix/export missing trigger JSON for full observability.
2) Review orphan-node workflows first (these can hide dead paths).
3) Consolidate repeated action patterns into reusable standards to reduce drift.
4) If you want, I can now generate a NotebookLM learning package (slides + infographic + audio) from this same dataset.`;
}

export async function explainWorkflowVisualMap(message, context = {}) {
  const workflows = await loadWorkflowCatalog();
  const workflow = pickWorkflowByMessage(workflows, message, context.workflowName);

  if (!workflow) {
    return "Workflow visual map ke liye workflow ka exact naam do (ya context.workflowName pass karo).";
  }

  const stats = buildWorkflowStats(workflow);
  const pathSummary = buildPathSummary(workflow);
  const chainMap = buildChainMap(workflow, 8, 4);

  return `Workflow Visual Summary: ${workflow.workflowName}

Trigger profile:
- Trigger count: ${stats.triggerCount}
- Trigger types: ${stats.triggerTypes.join(", ") || "unknown"}

Execution profile:
- Node count: ${stats.nodeCount}
- Edge count: ${stats.edgeCount}
- Orphan nodes: ${stats.orphanCount}

${pathSummary.happy}
${pathSummary.failure}

Chain-map view:
${chainMap}`;
}

export async function diagnoseWorkflowIssue(message, context = {}) {
  const workflows = await loadWorkflowCatalog();
  const workflow = pickWorkflowByMessage(workflows, message, context.workflowName);

  if (!workflow) {
    return "Workflow name clear nahi mila. Workflow ka exact naam do, ya message mein mention karo taake main targeted debugging kar sakun.";
  }

  const compactWorkflow = JSON.stringify(
    {
      workflow_name: workflow.workflowName,
      workflow_id: workflow.workflowId,
      trigger_json: workflow.rawJson.trigger_json,
      workflow_json: workflow.rawJson.workflow_json,
    },
    null,
    2
  ).slice(0, 12000);

  const historyContext = (context.chatHistory || [])
    .slice(-6)
    .map((m) => `[${m.role.toUpperCase()}]: ${m.text}`)
    .join("\n");

  const kbPrompt = [
    `Workflow debug karo: ${workflow.workflowName}`,
    `User issue: ${message}`,
    historyContext ? `Recent conversation context:\n${historyContext}` : null,
    "Workflow JSON context:",
    compactWorkflow,
    "Is issue ka likely root cause aur practical fix steps do.",
  ].filter(Boolean).join("\n\n");

  try {
    const answer = await askGhlAssistant({
      question: kbPrompt,
      mode: "cross",
    });
    const context7Insights = await queryContext7(message, workflow);

    return [
      `Debug focus workflow: ${workflow.workflowName}`,
      "",
      answer,
      "",
      context7Insights || "Context7 insights skipped (API key/config missing).",
    ].join("\n");
  } catch (error) {
    return `NotebookLM debug query fail hui: ${error.message}. Lekin workflow identify ho gaya hai (${workflow.workflowName}). Dobara try karo ya issue details aur specific do.`;
  }
}

export async function generateWorkflowLearningAssets(message) {
  const workflows = await loadWorkflowCatalog();
  if (!workflows.length) {
    return "Assets banane ke liye `workflows/` mein JSON files chahiye. Pehle Echo se workflows export karwa lo.";
  }

  const format = hasAny(message, ["all formats", "multi format", "multi-format", "everything"])
    ? "multi"
    : hasAny(message, ["slide", "slides"])
      ? "slides"
      : hasAny(message, ["infographic"])
        ? "infographic"
        : "audio";

  const notebookTitle = `GHL Workflow Debug Hub ${new Date().toISOString().slice(0, 10)}`;

  try {
    const createOutput = await runCommand("nlm", ["notebook", "create", notebookTitle]);
    const notebookId = detectNotebookId(createOutput);
    if (!notebookId) {
      return "Notebook create hua lagta hai lekin ID parse nahi hui. `nlm notebook list` se recent notebook dekh lo.";
    }

    for (const wf of workflows.slice(0, 20)) {
      const sourceText = JSON.stringify(
        {
          workflow_name: wf.workflowName,
          workflow_id: wf.workflowId,
          trigger_json: wf.rawJson.trigger_json,
          workflow_json: wf.rawJson.workflow_json,
        },
        null,
        2
      ).slice(0, 14000);

      await runCommand("nlm", [
        "source",
        "add",
        notebookId,
        "--text",
        sourceText,
        "--title",
        wf.workflowName,
      ]);
    }

    if (format === "slides") {
      await runCommand("nlm", ["slides", "create", notebookId, "--confirm"]);
    } else if (format === "infographic") {
      await runCommand("nlm", ["infographic", "create", notebookId, "--confirm"]);
    } else if (format === "multi") {
      await runCommand("nlm", ["slides", "create", notebookId, "--confirm"]);
      await runCommand("nlm", ["infographic", "create", notebookId, "--confirm"]);
      await runCommand("nlm", ["audio", "create", notebookId, "--confirm"]);
    } else {
      await runCommand("nlm", ["audio", "create", notebookId, "--confirm"]);
    }

    return `NotebookLM workflow notebook ready: ${notebookId}. I have started ${format} generation from your workflow sources.`;
  } catch (error) {
    return `NotebookLM automation start nahi ho saka: ${error.message}. Ensure ` + "`nlm login`" + " is active, phir dubara try karo.";
  }
}
