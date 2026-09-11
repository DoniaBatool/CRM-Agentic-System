/**
 * Veronica — Platform Brain Agent (OpenAI Agents SDK)
 *
 * Wraps veronica-agent.js pure functions as SDK tools.
 * Also includes Nova's learn/explain capability via askGhlAssistant.
 */

import { Agent, tool, webSearchTool } from "@openai/agents";
import { z } from "zod";
import {
  diagnoseWorkflowIssue,
  explainWorkflowVisualMap,
  explainExistingWorkflows,
  generateEndToEndWorkflowReport,
  generateWorkflowLearningAssets,
  getContext7Status,
  browseSubAccountsAsync,
  listWorkflowsInFolder,
} from "../veronica-agent.js";
import { askGhlAssistant } from "../../ghl-assistant.js";

// ─── Tools ───────────────────────────────────────────────────────────────────

const browseSubAccountsTool = tool({
  name: "browse_sub_accounts",
  description:
    "List all sub-account folders in the workflows/ directory. Use before listing workflows to show the user which accounts have exported data.",
  parameters: z.object({}),
  execute: async () => {
    const result = await browseSubAccountsAsync();
    return result.subAccounts.length
      ? `Sub-accounts with exported workflows:\n${result.subAccounts.map((s) => `• ${s}`).join("\n")}`
      : "No sub-account folders found. Use Echo to export workflows first.";
  },
});

const listWorkflowsInFolderTool = tool({
  name: "list_workflows_in_folder",
  description:
    "List all exported workflow JSON files within a specific sub-account folder.",
  parameters: z.object({
    folderName: z.string().describe("Sub-account folder name (e.g. 'bucktooth marketing')"),
  }),
  execute: async ({ folderName }) => {
    const result = await listWorkflowsInFolder(folderName);
    if (result.error) return result.error;
    return result.workflows.length
      ? `Workflows in '${folderName}':\n${result.workflows.map((w) => `• ${w.workflowName}`).join("\n")}`
      : `No exported JSON files found in '${folderName}'.`;
  },
});

const learnGhlTool = tool({
  name: "learn_ghl",
  description:
    "Answer questions about GoHighLevel (GHL) concepts, workflows, automation, triggers, actions, pipelines, and best practices. Use this for 'explain', 'how does', 'what is' questions.",
  parameters: z.object({
    question: z.string().describe("The GHL question or topic to explain"),
  }),
  execute: async ({ question }) => {
    const answer = await askGhlAssistant({ question, mode: "cross" });
    return answer;
  },
});

const diagnoseWorkflowTool = tool({
  name: "diagnose_workflow",
  description:
    "Debug a specific GHL workflow issue. Requires workflow name and description of the problem. Analyzes the exported workflow JSON.",
  parameters: z.object({
    workflowName: z.string().describe("Name of the workflow to debug"),
    issue: z.string().describe("Description of the issue or bug"),
  }),
  execute: async ({ workflowName, issue }) => {
    const result = await diagnoseWorkflowIssue(issue, { workflowName });
    return result;
  },
});

const visualMapTool = tool({
  name: "workflow_visual_map",
  description:
    "Show a chain-map visualization of a workflow — nodes, triggers, happy path, and failure path.",
  parameters: z.object({
    workflowName: z.string().describe("Name of the workflow to visualize"),
  }),
  execute: async ({ workflowName }) => {
    const result = await explainWorkflowVisualMap("", { workflowName });
    return result;
  },
});

const listWorkflowsTool = tool({
  name: "list_workflows",
  description: "List all exported GHL workflows in the workflows/ directory.",
  parameters: z.object({}),
  execute: async () => {
    const result = await explainExistingWorkflows();
    return result;
  },
});

const analyzerReportTool = tool({
  name: "workflow_analyzer_report",
  description:
    "Generate a detailed analysis report of all GHL workflows — node counts, orphans, triggers, action types, path summaries.",
  parameters: z.object({
    mode: z
      .enum(["brief", "deep"])
      .nullable()
      .describe("Brief for executive summary, deep for full technical report (default: deep)"),
  }),
  execute: async ({ mode } = {}) => {
    const result = await generateEndToEndWorkflowReport(mode || "deep");
    return result;
  },
});

const generateLearningAssetsTool = tool({
  name: "generate_learning_assets",
  description:
    "Generate NotebookLM learning assets (slides, infographic, audio) from the exported GHL workflows.",
  parameters: z.object({
    format: z
      .enum(["slides", "infographic", "audio", "multi"])
      .nullable()
      .describe("Output format (default: audio)"),
  }),
  execute: async ({ format } = {}) => {
    const result = await generateWorkflowLearningAssets(format || "audio");
    return result;
  },
});

const context7StatusTool = tool({
  name: "check_context7_status",
  description: "Check the Context7 API connection status.",
  parameters: z.object({}),
  execute: async () => {
    const result = await getContext7Status();
    return result;
  },
});

// ─── Agent ───────────────────────────────────────────────────────────────────

export const veronicaAgent = new Agent({
  name: "Veronica",
  instructions: `You are Veronica 🧠, the Platform Brain for DentaFlow — a dental marketing agency platform.

Your job:
- Answer any GHL (GoHighLevel) questions: concepts, triggers, actions, automation best practices
- Search the web for latest GHL updates, feature releases, and documentation
- Browse exported workflow sub-account folders and list available workflows
- Explain specific GHL workflows step-by-step in plain language
- Debug specific GHL workflow issues using exported JSON files
- Show visual chain-maps of workflows
- Generate analysis reports of the full workflow system
- Create NotebookLM learning assets (slides, infographic, audio) from workflow data

Capabilities:
1. BROWSE: Use browse_sub_accounts to see which accounts have exported workflows
2. LIST: Use list_workflows_in_folder to see workflows in a specific sub-account
3. LEARN: Use learn_ghl for any "explain/how/what" GHL question
4. SEARCH: Use web_search for latest GHL news, feature releases, or docs not in local knowledge
5. DEBUG: Use diagnose_workflow — needs workflow name + issue description
6. VISUAL: Use workflow_visual_map — needs workflow name
7. REPORT: Use workflow_analyzer_report — brief or deep
8. ASSETS: Use generate_learning_assets — slides, infographic, audio

When a user wants to explain or debug a workflow, first use browse_sub_accounts → list_workflows_in_folder to confirm the workflow exists, then proceed.

If the user's request is ambiguous, ask: "Do you want to debug a specific workflow, get a report, or learn about a GHL concept?"

Exported workflow JSONs must exist in the workflows/ folder. If none exist, ask the user to export them using Echo first.`,
  tools: [
    browseSubAccountsTool,
    listWorkflowsInFolderTool,
    learnGhlTool,
    webSearchTool({ searchContextSize: "medium" }),
    diagnoseWorkflowTool,
    visualMapTool,
    listWorkflowsTool,
    analyzerReportTool,
    generateLearningAssetsTool,
    context7StatusTool,
  ],
});
