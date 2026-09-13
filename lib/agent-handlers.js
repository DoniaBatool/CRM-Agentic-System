import fs from "fs/promises";
import path from "path";
import { run } from "@openai/agents";
import { irisAgent } from "./agents/iris.js";
import { dashAgent } from "./agents/dash.js";
import { calAgent } from "./agents/cal.js";
import { maxAgent } from "./agents/max.js";
import { rexAgent } from "./agents/rex.js";
import { noraAgent } from "./agents/nora.js";
import { saraAgent } from "./agents/sara.js";
import { veronicaAgent } from "./agents/veronica.js";
import { askGhlAssistant } from "../ghl-assistant.js";
import {
  deleteExportedWorkflowFiles,
  exportSelectedWorkflows,
  listExportedWorkflowFiles,
  listAvailableSubAccounts,
  loadExportedWorkflowContent,
  listWorkflows,
} from "../workflow-agent.js";
import { getSuggestedDateTime, getWebhookMap, searchContacts, triggerWorkflowWebhook } from "../ghl-webhook-trigger.js";
import {
  fireWebhook,
  saveWebhookHistory,
  getWebhookHistory,
  retryWebhook,
  bulkFireWebhooks,
  healthCheckWebhooks,
  getCustomEvents,
  saveCustomEvent,
  deleteCustomEvent,
  getPayloadTemplates,
  savePayloadTemplate,
  deletePayloadTemplate,
  getBuiltInWebhookMap,
  resolveWebhookUrl,
  getDefaultDateTime,
  BUILT_IN_EVENT_LABELS,
  getSubAccounts,
  addSubAccount,
  getSubAccountWebhooks,
  setSubAccountWebhook,
  seedSubAccountsFromEnv,
} from "./sara-agent.js";
import {
  diagnoseWorkflowIssue,
  explainWorkflowVisualMap,
  explainExistingWorkflows,
  explainWorkflowFile,
  debugWorkflowFile,
  generateEndToEndWorkflowReport,
  generateWorkflowLearningAssets,
  getContext7Status,
  loadWorkflowCatalog,
  browseSubAccountsAsync,
  listWorkflowsInFolder,
} from "./veronica-agent.js";
import {
  continueSurveyTargetsAfterManualVerify,
  getSurveyAgentConfig,
  openSurveyTargetsForManualVerify,
  runSurveyTargets,
} from "./survey-agent.js";
import { searchLeads, getLeads, clearLeads, exportLeadsCsv } from "./rex-agent.js";
import {
  generateEmailTemplates,
  generateProposal,
  generateSocialPost,
  generateAdCopy,
  listTemplates,
  getTemplate,
  deleteTemplate,
} from "./nora-agent.js";
import {
  sendEmail,
  sendWhatsApp,
  triggerSequence,
  scheduleSequence,
  getOutreachHistory,
  getPipelineLeads,
  getMaxConfig,
  generateIntakeToken,
  SEQUENCES,
} from "./max-agent.js";
import {
  getAvailableSlots,
  createAppointment,
  rescheduleAppointment,
  cancelAppointment,
  generateBookingLink,
  listAppointments,
} from "./cal-agent.js";
import { AGENT_BY_ID } from "./agents.js";
import { getSupabase } from "./supabase.js";
import { getSystemPrompt, saveInteraction } from "./self-learning.js";
import {
  processIntake,
  getRecentLeads,
  getPipelineCounts,
  getIrisConfig,
  deleteLead,
  INTAKE_SOURCES,
} from "./iris-agent.js";
import {
  moveLeadStage,
  forceMoveLeadStage,
  getBoardData,
  getLeadDetail,
  addLeadNote,
  getPipelineStats,
  getDashConfig,
} from "./dash-agent.js";

// Seed sub-accounts from .env on startup (runs once, idempotent)
seedSubAccountsFromEnv().catch((err) =>
  console.warn("Sara seedSubAccountsFromEnv:", err.message)
);

function isGreetingMessage(message) {
  if (message === "__action__") return false;
  const text = normalizeText(message);
  if (!text) return false;

  return (
    /(^|\s)(hi|hello|hey|salam|assalam)(\s|$)/.test(text) ||
    text.includes("how are you") ||
    text.includes("kese ho") ||
    text.includes("kaise ho")
  );
}

function shouldSendIntro(message, context) {
  const text = (message || "").trim().toLowerCase();
  return (
    Boolean(context?.forceIntro) ||
    text.includes("what can you do") ||
    text.includes("introduce yourself") ||
    text.includes("your scope")
  );
}

function getGreetingResponse(agentId) {
  const responses = {
    orchestrator:
      "Hi! I am Luna 🌙. I am doing great and ready to help. Share your goal and I will route it to the right specialist — Iris (lead intake), Dash (pipeline), Rex (lead scraping), Max (email/WhatsApp outreach), Nora (content), Cal (calendar), Veronica (GHL debugging), Echo (workflow export), Sara (CRM webhook), Ayla (survey forms), Atlas (client onboarding). How can I help you today?",
    "ghl-assistant":
      "Hi! I am Veronica 🧠, doing well. I handle both learning and debugging now. Ask me any GHL concept or share a workflow issue!",
    "workflow-export":
      "Hi! I am Echo ⚙️, doing great. I can help you export workflow JSON from any GHL sub-account. Want to start with the sub-account name?",
    "workflow-tester":
      "Hi! I'm Sara 🎯 — your GHL Workflow Tester.\n\nI fire webhook triggers to test your automation workflows. Here's what I can do:\n- 🔍 Search a contact by name, then fire a webhook for them\n- ⚡ Test Treatment Booked, Treatment Rescheduled, Personal Consultation Booked/Rescheduled\n- 📋 Track every webhook you've fired in history\n- 💊 Health-check all your configured webhook URLs\n- 🔁 Retry failed webhooks with one click\n- 🚀 Bulk-fire one event for multiple contacts at once\n- ✦ Add custom event types beyond the 4 built-in ones\n\nYou can use the panel above to search, build, and fire — or just chat with me. Try: *\"search contact Ali Khan\"* or *\"how do you trigger a workflow?\"*",
    veronica:
      "Hi! I am Veronica 🧠, your GHL Platform Brain. Here's what I can do:\n\n• 🔍 **Debug a workflow** — pick a sub-account → select a workflow → I diagnose what's broken and why\n• 💡 **Explain a workflow** — I break down any workflow step-by-step in plain English\n• 📊 **Full workflow analysis** — report on all exported workflows (orphan nodes, triggers, action stats)\n• 🌐 **Answer GHL questions** — white labeling, SaaS Mode, triggers, actions, pipelines, best practices\n• 🔎 **Web search** — latest GHL updates, feature releases, and documentation\n• 📓 **Create learning assets** — generate NotebookLM slides, infographics, or audio from your workflows\n\nTry: *\"I want to debug a workflow\"* or *\"Explain Workflow #10a\"* or *\"What is white labeling in GHL?\"*",
    rex:
      "Hi! I am Rex 🔍, doing great. I find business leads from Google Maps. Tell me industry + city (e.g. 'dental clinic in Houston') and I will scout qualified prospects for you.",
    nora:
      "Hi! I am Nora ✍️, doing well. I create email templates, proposals, social posts, and ad copy. Tell me the industry and what content you need.",
    max:
      "Hi! I'm Max 📧 — your Outreach Agent. I send automated emails via Brevo: welcome sequences, follow-ups, and meeting reminders. All emails go through `outreach_schedule` and are picked up by the cron job every 30 minutes.",
    cal:
      "Hi! I am Cal 📅, doing great. I manage your Google Calendar appointments. I can show available slots, create bookings, handle reschedules, and send you notifications.",
    "survey-tester":
      "Hi! I am Ayla 🧪, ready to help. I auto-fill and submit surveys/forms using your saved users. Load config and I will handle the rest.",
    iris:
      "Hi! I am Iris 🌸, your Lead Intake Gateway. I capture leads from survey forms and calendar bookings and add them to the pipeline. How can I help?",
    dash:
      "Hi! I am Dash 📊, your Pipeline Manager. I manage your agency Kanban board — move leads, track stages, add notes. What would you like to see?",
    atlas:
      "Hi! I am Atlas 🏗️, your Onboarding Architect. I set up the complete dental business stack when a lead becomes a client. Ready when you need me.",
  };

  return responses[agentId] || "Hi! I am ready to help. How can I help you today?";
}

function withSystemPrompt(agentId, defaultPrompt) {
  return getSystemPrompt(agentId, defaultPrompt);
}

function normalizeText(input) {
  return String(input || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function scoreIntent(text, keywords) {
  return keywords.reduce((score, keyword) => (text.includes(keyword) ? score + 1 : score), 0);
}

function pickLikelyWorkflowName(message, workflows) {
  const text = normalizeText(message);
  const explicit = text.match(/wf[-\s]?\d+[a-z]?/i)?.[0];
  if (explicit) return explicit.replace(/\s+/g, "-").toUpperCase();

  const matched = workflows.find((wf) => text.includes(normalizeText(wf.workflowName)));
  return matched?.workflowName || null;
}

function buildClarification(intent) {
  const clarifiers = {
    debug: [
      "Workflow ka exact naam kya hai?",
      "Expected behavior kya tha aur actual kya ho raha hai?",
      "Issue kis step/event ke baad start hota hai?",
    ],
    visual: [
      "Kis workflow ka chain map chahiye?",
      "Aap happy path chahte hain, failure path, ya dono?",
    ],
    assets: [
      "Kaunsa output chahiye: slides, infographic, audio, ya all formats?",
      "Kya saare workflows include karne hain ya specific workflow?",
    ],
    report: [
      "Brief report chahiye ya deep technical report?",
      "Koi specific workflow priority par rakhna hai?",
    ],
    unknown: [
      "Aapka main goal kya hai: debug, summary report, visual map, ya learning assets?",
      "Agar debug hai to workflow name + issue detail share karein.",
    ],
  };

  const questions = clarifiers[intent] || clarifiers.unknown;
  return `Mujhe task clear karne ke liye 1-2 details chahiye:\n- ${questions.join("\n- ")}`;
}

function classifyVeronicaIntent(message, context = {}) {
  const text = normalizeText(message);

  const scores = {
    context7: scoreIntent(text, ["context7 status", "check context7", "status context7"]),
    visual: scoreIntent(text, ["chain map", "dependency map", "happy path", "failure path", "visual summary"]),
    report: scoreIntent(text, [
      "brief analyzer report",
      "deep analyzer report",
      "brief report",
      "deep report",
      "summary report",
      "end to end",
      "end-to-end",
      "analyzer report",
      "existing workflows",
      "all workflows",
      "workflow detail",
    ]),
    assets: scoreIntent(text, ["slides", "infographic", "audio", "podcast", "create notebook", "all formats"]),
    debug: scoreIntent(text, [
      "issue",
      "error",
      "bug",
      "stuck",
      "debug",
      "problem",
      "not working",
      "nahi",
      "fail",
      "failed",
      "doesnt work",
      "doesn't work",
    ]),
  };

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topIntent, topScore] = sorted[0];
  const secondScore = sorted[1]?.[1] || 0;

  const hasWorkflowHint = Boolean(context.workflowName) || /wf[-\s]?\d+[a-z]?/i.test(message || "");
  const confidence = topScore === 0 ? 0 : topScore - secondScore + (hasWorkflowHint ? 1 : 0);
  const intent = topScore === 0 && hasWorkflowHint ? "debug" : topIntent;
  const adjustedConfidence =
    topScore === 0 && hasWorkflowHint ? 1 : confidence;

  return {
    intent,
    confidence: adjustedConfidence,
    hasWorkflowHint,
  };
}

function classifyNovaIntent(message) {
  const text = normalizeText(message);
  const learn = scoreIntent(text, [
    "learn",
    "explain",
    "how",
    "samjhao",
    "guide",
    "workflow",
    "automation",
    "ghl",
  ]);
  const format = scoreIntent(text, [
    "flashcard",
    "quiz",
    "infographic",
    "audio",
    "slides",
    "diagram",
  ]);

  const intent = format > learn ? "format" : "learn";
  const confidence = Math.max(learn, format);
  return { intent, confidence };
}

function classifyEchoIntent(message) {
  const text = normalizeText(message);
  const list = scoreIntent(text, ["list workflows", "show workflows", "workflows", "export"]);
  const explain = scoreIntent(text, ["status", "detail", "explain"]);
  const intent = list >= explain ? "export" : "explain";
  return { intent, confidence: Math.max(list, explain) };
}

function classifySaraIntent(message, context = {}) {
  if (context.action === "search-contact") {
    return { intent: "search-contact", confidence: 2 };
  }
  if (context.action === "trigger-webhook") {
    return { intent: "trigger-webhook", confidence: 2 };
  }

  const text = normalizeText(message);
  const search = scoreIntent(text, ["contact", "find", "search", "naam", "lookup"]);
  const trigger = scoreIntent(text, [
    "trigger",
    "webhook",
    "booked",
    "rescheduled",
    "treatment",
    "consultation",
    "send",
  ]);

  if (search === 0 && trigger === 0) {
    return { intent: "unknown", confidence: 0 };
  }
  return {
    intent: trigger > search ? "trigger-webhook" : "search-contact",
    confidence: Math.max(search, trigger),
  };
}

export async function runAgent(agentId, message, context = {}) {
  const agent = AGENT_BY_ID[agentId];
  const prompt = withSystemPrompt(
    agentId,
    `You are ${agent?.name || agentId}. Stay focused on your role and provide practical GHL guidance.`
  );

  if (isGreetingMessage(message)) {
    const greetingResponse = getGreetingResponse(agentId);
    saveInteraction(agentId, message, greetingResponse);
    return {
      handledBy: agentId,
      response: greetingResponse,
      data: { promptUsed: prompt },
    };
  }

  if (shouldSendIntro(message, context)) {
    const intro = agent?.intro || "I am ready to help.";
    saveInteraction(agentId, message, intro);
    return { handledBy: agentId, response: intro, data: { promptUsed: prompt } };
  }

  // ghl-assistant is now merged into veronica — redirect silently
  if (agentId === "ghl-assistant") {
    agentId = "veronica";
  }

  // ─── Veronica pre-SDK: explicit panel actions + structured chat flow ──────
  // These MUST run before SDK routing — the SDK doesn't know about UI panel actions.
  if (agentId === "veronica") {

    // ── Panel / UI actions ─────────────────────────────────────────────────
    if (context.action === "browse-sub-accounts") {
      const result = await browseSubAccountsAsync();
      return {
        handledBy: "veronica",
        response: result.subAccounts.length
          ? `Found ${result.subAccounts.length} sub-account(s).`
          : "No sub-account folders found. Export workflows with Echo first.",
        data: { type: "veronica_sub_accounts", subAccounts: result.subAccounts, mode: context.veronica_mode || null },
      };
    }

    if (context.action === "list-workflows-in-folder") {
      const result = await listWorkflowsInFolder(context.folderName);
      return {
        handledBy: "veronica",
        response: result.error
          ? result.error
          : `Found ${result.workflows.length} workflow(s) in '${context.folderName}'.`,
        data: {
          type: "veronica_workflow_list",
          folderName: context.folderName,
          workflows: result.workflows || [],
          mode: context.veronica_mode || null,
        },
      };
    }

    if (context.action === "explain-workflow" || context.action === "debug-workflow") {
      const { filePath, fileName } = context;
      let fileContent = null;
      try { fileContent = await fs.readFile(filePath, "utf-8"); } catch {
        return { handledBy: "veronica", response: `Could not read: ${fileName}. Make sure it's exported.`, data: {} };
      }
      let parsed;
      try { parsed = JSON.parse(fileContent); } catch { parsed = null; }
      const intent = context.action === "debug-workflow" ? "debug" : "explain";
      const response = intent === "explain"
        ? await explainWorkflowFile(parsed)
        : await debugWorkflowFile(parsed, message);
      saveInteraction(agentId, message, response);
      return { handledBy: "veronica", response, data: { type: "workflow_result", intent } };
    }

    // ── Legacy panel actions ────────────────────────────────────────────────
    if (context.action === "workflow-menu") {
      return { handledBy: "veronica", response: "What would you like to do with your workflows?", data: { type: "workflow_menu" } };
    }

    if (context.action === "list-workflow-files") {
      const workflowsDir = path.join(process.cwd(), "workflows");
      let files = [];
      try {
        const walk = async (dir) => {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) { await walk(path.join(dir, entry.name)); }
            else if (entry.name.endsWith(".json")) {
              const fullPath = path.join(dir, entry.name);
              files.push({ fileName: entry.name, relativePath: path.relative(workflowsDir, fullPath), fullPath });
            }
          }
        };
        await walk(workflowsDir);
      } catch { files = []; }
      return {
        handledBy: "veronica",
        response: files.length ? `Found ${files.length} exported workflows.` : "No exported workflows found.",
        data: { type: "workflow_files", files },
      };
    }

    // ── Chat intent detection: structured debug/explain flow ────────────────
    const msgLower = (message || "").toLowerCase();
    const isDebugIntent = /\b(want\s+to\s+debug|i\s+want\s+debug|debug\s+a\s+workflow|want\s+debug)\b/i.test(message);
    const isExplainIntent = /\b(want\s+to\s+explain|i\s+want\s+explain|explanation\s+of\s+a\s+workflow|want\s+explanation|explain\s+a\s+workflow)\b/i.test(message);
    const isSpecificDebug = /\b(specific\s+workflow|debug\s+specific|specific.*debug)\b/i.test(message) && (context.veronica_mode === "debug" || isDebugIntent || msgLower.includes("debug"));
    const isSpecificExplain = /\b(specific\s+workflow|explain\s+specific|specific.*explain)\b/i.test(message) && (context.veronica_mode === "explain" || isExplainIntent || msgLower.includes("explain"));

    if ((isDebugIntent || isExplainIntent) && !isSpecificDebug && !isSpecificExplain) {
      const mode = isDebugIntent ? "debug" : "explain";
      const label = mode === "debug" ? "Debug" : "Explain";
      const response = `Do you want to ${mode} a specific workflow, get a report, or learn about a GHL concept?`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "veronica",
        response,
        data: { type: "veronica_clarify", mode, options: [`${label} a specific workflow`, "Get a report", "Learn about a GHL concept"] },
      };
    }

    if (isSpecificDebug || isSpecificExplain) {
      const mode = isSpecificDebug ? "debug" : "explain";
      const result = await browseSubAccountsAsync();
      const response = result.subAccounts.length
        ? `Select a sub-account to ${mode} a workflow from:`
        : "No sub-account folders found. Export workflows with Echo first.";
      saveInteraction(agentId, message, response);
      return {
        handledBy: "veronica",
        response,
        data: { type: "veronica_sub_accounts", subAccounts: result.subAccounts, mode },
      };
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ── Dash — pre-SDK panel actions ─────────────────────────────────────────
  if (agentId === "dash") {
    if (context.action === "get-board") {
      const board = await getBoardData();
      return { handledBy: "dash", response: `Board loaded. Total: ${board.totalCount}`, data: board };
    }
    if (context.action === "move-stage") {
      if (!context.leadId || !context.toStage) return { handledBy: "dash", response: "Missing params.", data: { success: false } };
      // Force-move: bypass strict VALID_TRANSITIONS — UI allows any stage move
      const result = await forceMoveLeadStage({ leadId: context.leadId, toStage: context.toStage, note: context.note || "" });

      // When moving to meeting_scheduled, auto-schedule pre-meeting reminders for lead + Donia
      if (context.toStage === "meeting_scheduled" && context.meetingDatetime) {
        const sb = getSupabase();
        let leadEmail = context.leadEmail || null;
        let leadName  = context.leadName  || null;
        let leadPhone = context.leadPhone || null;
        let clinicName = context.clinicName || null;
        let city = context.city || null;

        // If lead details not passed in context, fetch from Supabase
        if (sb && (!leadEmail || !leadName)) {
          try {
            const { data: ld } = await sb
              .from("agency_leads")
              .select("name, email, phone, organization_name, city")
              .eq("id", context.leadId)
              .single();
            if (ld) {
              leadEmail  = leadEmail  || ld.email;
              leadName   = leadName   || ld.name;
              leadPhone  = leadPhone  || ld.phone;
              clinicName = clinicName || ld.organization_name || ld.name;
              city       = city       || ld.city;
            }
          } catch (_) {}
        }

        try {
          await scheduleSequence({
            sequenceKey: "pre_meeting_reminder",
            lead: {
              id:              context.leadId,
              name:            leadName  || "Lead",
              email:           leadEmail || "",
              phone:           leadPhone || "",
              clinicName:      clinicName || leadName || "Lead",
              city:            city || "",
              meetingDatetime: context.meetingDatetime,
              meetingLink:     context.meetingLink || "",
            },
          });
        } catch (err) {
          console.error("[Dash→Max] pre_meeting_reminder schedule failed:", err.message);
        }
      }

      return { handledBy: "dash", response: `Moved to ${context.toStage}`, data: result };
    }
    if (context.action === "get-lead-detail") {
      if (!context.leadId) return { handledBy: "dash", response: "Missing leadId.", data: null };
      const detail = await getLeadDetail(context.leadId);
      return { handledBy: "dash", response: "Detail loaded.", data: detail };
    }
    if (context.action === "add-note") {
      if (!context.leadId || !context.note) return { handledBy: "dash", response: "Missing params.", data: { success: false } };
      const result = await addLeadNote({ leadId: context.leadId, note: context.note, addedBy: "user" });
      return { handledBy: "dash", response: "Note added.", data: result };
    }
    // No match → fall through to SDK for LLM chat
  }

  // ── Iris — pre-SDK panel actions ─────────────────────────────────────────
  if (agentId === "iris") {
    if (context.action === "submit-lead") {
      const payload = {
        name: context.name, email: context.email, phone: context.phone,
        organization_name: context.organization_name, city: context.city,
        source: context.source || "manual", message: context.message,
        website_url: context.website_url,
      };
      const result = await processIntake(payload);
      if (!result.success) {
        return { handledBy: "iris", response: "Lead validation failed.", data: { success: false, errors: result.errors } };
      }
      // Auto-trigger Max welcome sequence for new leads with email
      if (result.isNew && result.lead?.email && result.lead?.id) {
        const sb = getSupabase();
        const intakeToken = generateIntakeToken();
        if (sb) {
          await sb.from("agency_leads").update({ intake_token: intakeToken }).eq("id", result.lead.id);
        }
        // Must await — fire-and-forget may not complete in serverless (learning #67)
        try {
          await scheduleSequence({
            sequenceKey: "new_lead_sequence",
            lead: {
              id:          result.lead.id,
              name:        result.lead.name,
              email:       result.lead.email,
              phone:       result.lead.phone || "",
              clinicName:  result.lead.organization_name || result.lead.name,
              city:        result.lead.city || "",
              intakeToken: intakeToken,
            },
          });
        } catch (err) {
          console.error("[Iris→Max] submit-lead schedule failed:", err.message);
        }
      }
      return {
        handledBy: "iris",
        response: result.isNew ? `✅ Lead added — ${result.lead.name}${result.lead.email ? " (welcome email scheduled)" : ""}` : `ℹ️ Lead already exists.`,
        data: { success: true, isNew: result.isNew, stage: result.stage, lead: result.lead },
      };
    }

    if (context.action === "get-pipeline-counts") {
      const counts = await getPipelineCounts();
      return { handledBy: "iris", response: "Pipeline counts loaded.", data: { counts } };
    }

    if (context.action === "get-recent-leads") {
      const leads = await getRecentLeads({ limit: context.limit || 20 });
      return { handledBy: "iris", response: `${leads.length} leads loaded.`, data: { leads } };
    }

    if (context.action === "delete-lead") {
      const result = await deleteLead(context.leadId);
      return { handledBy: "iris", response: "Lead deleted.", data: { success: true, deleted: result.deleted } };
    }

    // Add Rex-scraped leads to pipeline
    if (context.action === "add-rex-leads") {
      const rexLeads = context.leads || [];
      if (!rexLeads.length) {
        return { handledBy: "iris", response: "No leads provided.", data: { success: false, added: 0 } };
      }
      const sb = getSupabase();
      if (!sb) {
        return { handledBy: "iris", response: "Supabase not connected.", data: { success: false, added: 0 } };
      }
      let added = 0, skipped = 0, errors = [];
      for (const l of rexLeads) {
        try {
          const clinicName = (l.name || l.organization_name || "").trim();
          if (!clinicName) { skipped++; continue; }

          // Skip duplicates by organization_name
          const { data: existing } = await sb
            .from("agency_leads")
            .select("id")
            .eq("organization_name", clinicName)
            .maybeSingle();
          if (existing) { skipped++; continue; }

          const intakeToken = generateIntakeToken();
          const { data: insertedLead, error: insertErr } = await sb.from("agency_leads").insert([{
            name: clinicName,
            organization_name: clinicName,
            email: l.email || "",
            phone: l.phone || "",
            city: l.city || "",
            website_url: l.website || "",
            source: "rex",
            stage: "new_lead",
            interest_level: null,
            treatments_offered: [],
            intake_token: intakeToken,
            message: `Scraped via Rex. Category: ${l.category || ""}. Rating: ${l.rating || "N/A"}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }]).select("id").single();
          if (insertErr) {
            errors.push(`${clinicName}: ${insertErr.message}`);
          } else {
            added++;
            // Auto-trigger Max welcome sequence if lead has an email
            if (l.email && insertedLead?.id) {
              scheduleSequence({
                sequenceKey: "new_lead_sequence",
                lead: {
                  id:          insertedLead.id,
                  name:        clinicName,
                  email:       l.email,
                  phone:       l.phone || "",
                  clinicName:  clinicName,
                  city:        l.city || "",
                  intakeToken: intakeToken,
                },
              }).catch((err) => console.error(`[Iris→Max] schedule failed for ${clinicName}:`, err.message));
            }
          }
        } catch (e) {
          errors.push((l.name || "?") + ": " + e.message);
        }
      }
      const errMsg = errors.length ? ` Errors: ${errors.join("; ")}` : "";
      return {
        handledBy: "iris",
        response: `✅ ${added} leads pipeline mein add ho gaye (new_lead stage).${skipped > 0 ? ` ${skipped} skip hue (duplicate).` : ""}${errMsg}`,
        data: { success: true, added, skipped, errors },
      };
    }

    // No match → fall through to SDK for LLM chat
  }

  // ─── Max pre-SDK block — panel actions bypass LLM routing ───────────────────
  if (agentId === "max") {
    if (context.action === "get-max-status") {
      const config = getMaxConfig();
      return { handledBy: "max", response: "", data: config };
    }
    if (context.action === "get-pipeline-leads") {
      const leads = await getPipelineLeads({ stage: context.stage || undefined });
      return { handledBy: "max", response: "", data: { leads } };
    }
    if (context.action === "schedule-sequence") {
      if (!context.sequenceKey || !context.lead?.id) {
        return { handledBy: "max", response: "❌ sequenceKey and lead.id required.", data: {} };
      }
      const sb = getSupabase();
      let lead = { ...context.lead };
      if (context.sequenceKey === "new_lead_sequence" && !lead.intakeToken && sb) {
        const token = generateIntakeToken();
        await sb.from("agency_leads").update({ intake_token: token }).eq("id", lead.id);
        lead.intakeToken = token;
      }
      const result = await scheduleSequence({ sequenceKey: context.sequenceKey, lead });
      return { handledBy: "max", response: `✅ ${result.scheduled} emails scheduled.`, data: result };
    }
    if (context.action === "get-history") {
      if (!context.leadId) return { handledBy: "max", response: "❌ leadId required.", data: {} };
      const history = await getOutreachHistory({ leadId: context.leadId, limit: context.limit || 20 });
      return { handledBy: "max", response: "", data: { history } };
    }
    // No match → fall through to SDK for LLM chat
  }

  // ─── OpenAI Agents SDK routing ────────────────────────────────────────────
  // Agents that use the SDK for LLM-driven tool selection.
  // Echo (workflow-export) and Ayla (survey-tester) are NOT in this map —
  // they run Playwright and stay on their own handlers below.
  const SDK_AGENTS = {
    iris: irisAgent,
    dash: dashAgent,
    cal: calAgent,
    "workflow-tester": saraAgent,
    max: maxAgent,
    rex: rexAgent,
    nora: noraAgent,
    sara: saraAgent,
    veronica: veronicaAgent,
  };

  if (SDK_AGENTS[agentId]) {
    // Build input: user message + context as JSON (skip chatHistory to save tokens)
    const { chatHistory: _ch, forceIntro: _fi, ...cleanCtx } = context;
    const ctxStr =
      Object.keys(cleanCtx).length > 0
        ? `\n\nContext: ${JSON.stringify(cleanCtx)}`
        : "";
    const input = `${message}${ctxStr}`;

    try {
      const result = await run(SDK_AGENTS[agentId], input);
      const response = result.finalOutput || "Done.";
      saveInteraction(agentId, message, response);
      return { handledBy: agentId, response, data: {} };
    } catch (err) {
      const response = `❌ Agent error: ${err.message}`;
      saveInteraction(agentId, message, response);
      return { handledBy: agentId, response, data: { error: err.message } };
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  if (agentId === "workflow-export") {
    const echoIntent = classifyEchoIntent(message);
    if (!context.subAccountName || !context.locationId || !context.token) {
      const response =
        "Main Echo hoon ⚙️. Start karne ke liye `subAccountName`, `locationId`, aur `token` chahiye. Phir main workflows list karunga aur aap checkbox se select karke export kar sakte ho.";
      saveInteraction(agentId, message, response);
      return {
        handledBy: "workflow-export",
        response,
        data: {
          intent: echoIntent.intent,
          confidence: echoIntent.confidence,
          sessionHints: { lastIntent: echoIntent.intent },
        },
      };
    }

    if (context.action === "export-selected") {
      const result = await exportSelectedWorkflows({
        subAccountName: context.subAccountName,
        locationId: context.locationId,
        token: context.token,
        workflowIds: context.workflowIds || [],
      });
      const nameList = (result.exportedWorkflows || [])
        .map((w) => `• ${w.name} (${w.id})`)
        .join("\n");
      const response = result.exportedCount > 0
        ? `Exported ${result.exportedCount} workflow${result.exportedCount !== 1 ? "s" : ""} to \`${result.outputDir}\`:\n${nameList}`
        : `Exported 0 workflows. Please select at least one workflow from the list.`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "workflow-export",
        response,
        data: {
          ...result,
          intent: echoIntent.intent,
          confidence: echoIntent.confidence,
          sessionHints: {
            lastIntent: "export",
            subAccountName: context.subAccountName,
            locationId: context.locationId,
            token: context.token,
          },
        },
      };
    }

    if (context.action === "list-sub-accounts") {
      const result = listAvailableSubAccounts();
      const response = result.subAccounts.length
        ? `Available sub-accounts: ${result.subAccounts.join(", ")}`
        : "No exported sub-account folders found in workflows/.";
      return {
        handledBy: "workflow-export",
        response,
        data: { ...result, intent: "list-sub-accounts" },
      };
    }

    if (context.action === "list-exported-json") {
      const result = listExportedWorkflowFiles({
        subAccountName: context.subAccountName,
      });
      const response = result.files.length
        ? `Found ${result.files.length} exported JSON files in \`${result.outputDir}\`.`
        : `Found 0 exported JSON files. Available sub-accounts: ${(result.availableSubAccounts || []).join(", ") || "none"}.`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "workflow-export",
        response,
        data: {
          ...result,
          intent: echoIntent.intent,
          confidence: echoIntent.confidence,
          sessionHints: {
            lastIntent: "list-exported-json",
            subAccountName: context.subAccountName,
          },
        },
      };
    }

    if (context.action === "delete-selected-json") {
      const result = deleteExportedWorkflowFiles({
        subAccountName: context.subAccountName,
        fileNames: context.fileNames || [],
      });
      const response = `Deleted ${result.deletedCount} JSON files from \`${result.outputDir}\`.`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "workflow-export",
        response,
        data: {
          ...result,
          intent: echoIntent.intent,
          confidence: echoIntent.confidence,
          sessionHints: {
            lastIntent: "delete-exported-json",
            subAccountName: context.subAccountName,
          },
        },
      };
    }

    if (context.action === "load-json-content") {
      const result = loadExportedWorkflowContent({
        subAccountName: context.subAccountName,
        fileName: context.fileName,
      });
      const wfName = result.content?.workflow_name || result.fileName.replace(".json", "");
      const wfId = result.content?.workflow_id || "";
      const steps = result.content?.workflow_json?.workflowData?.templates?.length ?? "?";
      const trigger = result.content?.trigger_json;
      const triggerType = Array.isArray(trigger) && trigger[0]?.type ? trigger[0].type : "unknown";
      const response = `📋 **${wfName}**\nID: \`${wfId}\`\nSteps: ${steps} | Trigger: \`${triggerType}\`\n\nJSON:\n\`\`\`json\n${JSON.stringify(result.content, null, 2)}\n\`\`\``;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "workflow-export",
        response,
        data: {
          ...result,
          intent: "load-json-content",
          sessionHints: { subAccountName: context.subAccountName },
        },
      };
    }

    let workflows;
    try {
      workflows = await listWorkflows({
        locationId: context.locationId,
        token: context.token,
      });
    } catch (err) {
      const msg = err.message || String(err);
      const hint403 =
        /403|access to this location/i.test(msg)
          ? "\n\n💡 GHL ka matlab: yeh PIT is locationId ke liye authorize nahi hai. Usi sub-account mein jao jahan se PIT banaya tha, wahan se Location ID copy karo — ya phir is location ke liye naya Private Integration Token banao (workflows read scope ke saath)."
          : "";
      const response = `❌ Workflows fetch nahi ho saki.\n${msg}\n\nCheck karo: locationId aur PIT ek hi sub-account se hon; token expired toh nahi? Whitespace toh nahi?${hint403}`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "workflow-export",
        response,
        data: {
          workflows: [],
          error: err.message,
          intent: echoIntent.intent,
          confidence: echoIntent.confidence,
        },
      };
    }
    const workflowOptions = workflows.map((wf) => ({
      id: wf.id,
      name: wf.name,
      status: wf.status || "N/A",
    }));
    const response =
      workflowOptions.length === 0
        ? `⚠️ GHL ne 0 workflows return kiye. Token mein workflow read scope hai? LocationId sahi hai?`
        : `Found ${workflowOptions.length} workflows. Select the ones you want to export.`;
    saveInteraction(agentId, message, response);
    return {
      handledBy: "workflow-export",
      response,
      data: {
        workflows: workflowOptions,
        intent: echoIntent.intent,
        confidence: echoIntent.confidence,
        sessionHints: {
          lastIntent: "export",
          subAccountName: context.subAccountName,
          locationId: context.locationId,
          token: context.token,
        },
      },
    };
  }

  // ── Sara — pre-SDK panel actions ───────────────────────────────────────────
  if (agentId === "workflow-tester") {
    // ── Search contacts ──
    if (context.action === "search-contacts") {
      const query = context.query || message;
      if (!query || query.trim().length < 2) {
        return { handledBy: "workflow-tester", response: "Please provide a contact name (minimum 2 characters).", data: {} };
      }
      try {
        const contacts = await searchContacts(query.trim(), context.locationId, context.pitToken);
        return {
          handledBy: "workflow-tester",
          response: `Found ${contacts.length} contact(s) for "${query}".`,
          data: {
            type: "sara_contacts",
            contacts: contacts.map((c) => ({
              id:        c.id,
              name:      c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim(),
              firstName: c.firstName || "",
              lastName:  c.lastName  || "",
              email:     c.email || null,
              phone:     c.phone || null,
            })),
          },
        };
      } catch (err) {
        return { handledBy: "workflow-tester", response: `Search failed: ${err.message}`, data: { error: err.message } };
      }
    }

    // ── Fire webhook ──
    if (context.action === "fire-webhook") {
      const { webhookUrl, payload, contactName, contactEmail, contactPhone, eventType, action: evAction } = context;
      if (!webhookUrl || !payload) {
        return { handledBy: "workflow-tester", response: "webhookUrl and payload are required.", data: {} };
      }
      try {
        const result = await fireWebhook({ webhookUrl, payload });
        await saveWebhookHistory({
          contactName, contactEmail, contactPhone,
          eventType, action: evAction, webhookUrl, payload,
          statusCode:   result.status_code,
          statusText:   result.status_text,
          responseBody: result.response_body,
          success:      result.success,
        });
        const statusEmoji = result.success ? "✅" : "❌";
        return {
          handledBy: "workflow-tester",
          response: `${statusEmoji} Webhook fired: ${result.status_code} ${result.status_text}`,
          data: { type: "sara_fire_result", ...result },
        };
      } catch (err) {
        return { handledBy: "workflow-tester", response: `Fire failed: ${err.message}`, data: { error: err.message } };
      }
    }

    // ── Get history ──
    if (context.action === "get-history") {
      const history = await getWebhookHistory({ limit: context.limit || 50, onlyFailed: context.onlyFailed || false });
      return {
        handledBy: "workflow-tester",
        response: `Loaded ${history.length} history entries.`,
        data: { type: "sara_history", history },
      };
    }

    // ── Retry webhook ──
    if (context.action === "retry-webhook") {
      if (!context.historyId) return { handledBy: "workflow-tester", response: "historyId required.", data: {} };
      try {
        const result = await retryWebhook(context.historyId);
        const statusEmoji = result.success ? "✅" : "❌";
        return {
          handledBy: "workflow-tester",
          response: `${statusEmoji} Retry: ${result.status_code} ${result.status_text}`,
          data: { type: "sara_fire_result", ...result },
        };
      } catch (err) {
        return { handledBy: "workflow-tester", response: `Retry failed: ${err.message}`, data: { error: err.message } };
      }
    }

    // ── Bulk fire ──
    if (context.action === "bulk-fire") {
      const { contacts, eventType, action: evAction, webhookUrl } = context;
      if (!contacts?.length || !webhookUrl) {
        return { handledBy: "workflow-tester", response: "contacts array and webhookUrl required.", data: {} };
      }
      const results = await bulkFireWebhooks({ contacts, eventType, action: evAction, webhookUrl });
      const passed = results.filter((r) => r.success).length;
      return {
        handledBy: "workflow-tester",
        response: `Bulk fire complete: ${passed}/${results.length} succeeded.`,
        data: { type: "sara_bulk_result", results },
      };
    }

    // ── Health check ──
    if (context.action === "health-check") {
      const custom = await getCustomEvents();
      const results = await healthCheckWebhooks(custom);
      const live = results.filter((r) => r.status === "live").length;
      return {
        handledBy: "workflow-tester",
        response: `Health check: ${live}/${results.length} webhooks live.`,
        data: { type: "sara_health", results },
      };
    }

    // ── Get init data (webhook map + custom events + templates + default dt) ──
    if (context.action === "get-init-data") {
      const [customEvents, templates] = await Promise.all([
        getCustomEvents().catch(() => []),
        getPayloadTemplates().catch(() => []),
      ]);
      return {
        handledBy: "workflow-tester",
        response: "Sara panel data loaded.",
        data: {
          type:            "sara_init",
          builtInMap:      getBuiltInWebhookMap(),
          builtInLabels:   BUILT_IN_EVENT_LABELS,
          customEvents,
          templates,
          defaultDateTime: getDefaultDateTime(),
        },
      };
    }

    // ── Sub-account management ──
    if (context.action === "get-sub-accounts") {
      const accounts = await getSubAccounts();
      return { handledBy: "workflow-tester", response: `${accounts.length} sub-account(s).`, data: { type: "sara_sub_accounts", accounts } };
    }
    if (context.action === "add-sub-account") {
      try {
        const account = await addSubAccount({ name: context.name, locationId: context.locationId, pitToken: context.pitToken });
        return { handledBy: "workflow-tester", response: `Sub-account "${account.name}" added.`, data: { account } };
      } catch (err) {
        return { handledBy: "workflow-tester", response: `Failed: ${err.message}`, data: { error: err.message } };
      }
    }
    if (context.action === "get-sub-account-webhooks") {
      if (!context.subAccountId) return { handledBy: "workflow-tester", response: "subAccountId required.", data: {} };
      const webhooks = await getSubAccountWebhooks(context.subAccountId);
      return { handledBy: "workflow-tester", response: `${webhooks.length} webhook(s).`, data: { type: "sara_sub_account_webhooks", webhooks } };
    }
    if (context.action === "set-webhook-url") {
      try {
        const updated = await setSubAccountWebhook(context.subAccountId, context.eventType, context.action2, context.webhookUrl);
        return { handledBy: "workflow-tester", response: "Webhook URL updated.", data: { webhook: updated } };
      } catch (err) {
        return { handledBy: "workflow-tester", response: `Failed: ${err.message}`, data: { error: err.message } };
      }
    }

    // ── Custom events CRUD ──
    if (context.action === "get-custom-events") {
      const events = await getCustomEvents();
      return { handledBy: "workflow-tester", response: `${events.length} custom event(s).`, data: { type: "sara_custom_events", events } };
    }
    if (context.action === "save-custom-event") {
      try {
        const event = await saveCustomEvent(context.event);
        return { handledBy: "workflow-tester", response: `Custom event "${event.event_label}" saved.`, data: { event } };
      } catch (err) {
        return { handledBy: "workflow-tester", response: `Failed: ${err.message}`, data: { error: err.message } };
      }
    }
    if (context.action === "delete-custom-event") {
      try {
        await deleteCustomEvent(context.id);
        return { handledBy: "workflow-tester", response: "Custom event deleted.", data: {} };
      } catch (err) {
        return { handledBy: "workflow-tester", response: `Failed: ${err.message}`, data: { error: err.message } };
      }
    }

    // ── Templates CRUD ──
    if (context.action === "get-templates") {
      const templates = await getPayloadTemplates();
      return { handledBy: "workflow-tester", response: `${templates.length} template(s).`, data: { type: "sara_templates", templates } };
    }
    if (context.action === "save-template") {
      try {
        const template = await savePayloadTemplate(context.template);
        return { handledBy: "workflow-tester", response: `Template "${template.name}" saved.`, data: { template } };
      } catch (err) {
        return { handledBy: "workflow-tester", response: `Failed: ${err.message}`, data: { error: err.message } };
      }
    }
    if (context.action === "delete-template") {
      try {
        await deletePayloadTemplate(context.id);
        return { handledBy: "workflow-tester", response: "Template deleted.", data: {} };
      } catch (err) {
        return { handledBy: "workflow-tester", response: `Failed: ${err.message}`, data: { error: err.message } };
      }
    }

    // ── Fall through to SDK for general chat ──
  }

  if (agentId === "survey-tester") {
    if (context.action === "load-config") {
      const config = await getSurveyAgentConfig();
      const response = `Loaded ${config.targets.length} targets and ${config.users.length} test users.`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "survey-tester",
        response,
        data: {
          ...config,
          sessionHints: { lastIntent: "survey-config-loaded" },
        },
      };
    }

    if (context.action === "run-selected-targets") {
      const result = await runSurveyTargets({
        targetIds: context.targetIds || [],
        userByTarget: context.userByTarget || {},
        answersByTarget: context.answersByTarget || {},
      });
      const response = `Submitted ${result.submittedTargets}/${result.totalTargets} selected targets.`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "survey-tester",
        response,
        data: {
          ...result,
          sessionHints: { lastIntent: "survey-run-complete" },
        },
      };
    }

    if (context.action === "open-manual-verify") {
      const result = await openSurveyTargetsForManualVerify({
        targetIds: context.targetIds || [],
        userByTarget: context.userByTarget || {},
        answersByTarget: context.answersByTarget || {},
      });
      const response =
        "Manual verification window opened (Playwright uses a fresh profile — it can look like an empty Chrome Incognito tab until the survey loads). Complete Cloudflare/security if shown, then click `Continue Auto-Fill`.";
      saveInteraction(agentId, message, response);
      return {
        handledBy: "survey-tester",
        response,
        data: {
          ...result,
          sessionHints: {
            lastIntent: "manual-verify-opened",
            surveySessionId: result.sessionId,
          },
        },
      };
    }

    if (context.action === "continue-after-verify") {
      const result = await continueSurveyTargetsAfterManualVerify({
        sessionId: context.surveySessionId,
      });
      const response = `Submitted ${result.submittedTargets}/${result.totalTargets} selected targets after manual verification.`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "survey-tester",
        response,
        data: {
          ...result,
          sessionHints: { lastIntent: "survey-run-complete", surveySessionId: null },
        },
      };
    }

    const response =
      "Ayla is ready. Click `Load Survey Config`, select targets + users, answer required questions, then run targets (or use manual verify mode first).";
    saveInteraction(agentId, message, response);
    return {
      handledBy: "survey-tester",
      response,
      data: {
        sessionHints: { lastIntent: "survey-ready" },
      },
    };
  }

  if (agentId === "veronica") {

    // ── Workflow menu action — show 3-question chooser ────────────────────────
    if (context.action === "workflow-menu") {
      return {
        handledBy: "veronica",
        response: "What would you like to do with your workflows?",
        data: { type: "workflow_menu" },
      };
    }

    // ── Browse sub-account folders ─────────────────────────────────────────────
    if (context.action === "browse-sub-accounts") {
      const result = await browseSubAccountsAsync();
      return {
        handledBy: "veronica",
        response: result.subAccounts.length
          ? `Found ${result.subAccounts.length} sub-account folder(s).`
          : "No sub-account folders found. Export workflows with Echo first.",
        data: { type: "veronica_sub_accounts", subAccounts: result.subAccounts },
      };
    }

    // ── List workflows in a folder ─────────────────────────────────────────────
    if (context.action === "list-workflows-in-folder") {
      const { folderName } = context;
      const result = await listWorkflowsInFolder(folderName);
      return {
        handledBy: "veronica",
        response: result.error
          ? result.error
          : result.workflows.length
            ? `Found ${result.workflows.length} workflow(s) in '${folderName}'.`
            : `No exported workflows in '${folderName}'.`,
        data: {
          type: "veronica_workflow_list",
          folderName,
          workflows: result.workflows || [],
        },
      };
    }

    // ── List workflow files from the workflows/ folder ─────────────────────────
    if (context.action === "list-workflow-files") {
      const workflowsDir = path.join(process.cwd(), "workflows");
      let files = [];
      try {
        const walk = async (dir) => {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              await walk(path.join(dir, entry.name));
            } else if (entry.name.endsWith(".json")) {
              const fullPath = path.join(dir, entry.name);
              const rel = path.relative(workflowsDir, fullPath);
              files.push({ fileName: entry.name, relativePath: rel, fullPath });
            }
          }
        };
        await walk(workflowsDir);
      } catch {
        files = [];
      }
      return {
        handledBy: "veronica",
        response: files.length ? `Found ${files.length} exported workflows.` : "No exported workflows found. Use Echo to export them first.",
        data: { type: "workflow_files", files },
      };
    }

    // ── Explain or debug a specific workflow file ──────────────────────────────
    if (context.action === "explain-workflow" || context.action === "debug-workflow") {
      const { filePath, fileName } = context;
      let fileContent = null;
      try {
        fileContent = await fs.readFile(filePath, "utf-8");
      } catch {
        return {
          handledBy: "veronica",
          response: `Could not read workflow file: ${fileName}. Make sure it exists in the workflows/ folder.`,
          data: {},
        };
      }
      let parsed;
      try { parsed = JSON.parse(fileContent); } catch { parsed = null; }
      const workflowName = parsed?.workflow_name || fileName?.replace(".json", "") || "this workflow";
      const intent = context.action === "debug-workflow" ? "debug" : "explain";
      const response = intent === "explain"
        ? await explainWorkflowFile(parsed)
        : await debugWorkflowFile(parsed, message);
      return {
        handledBy: "veronica",
        response,
        data: { type: "workflow_result", workflowName, intent },
      };
    }

    const text = (message || "").toLowerCase();
    const catalog = await loadWorkflowCatalog();
    const likelyWorkflow = context.workflowName || pickLikelyWorkflowName(message, catalog);

    // ── Nova "learn/explain" intent — merged from ghl-assistant ───────────────
    const novaIntent = classifyNovaIntent(message);
    const shortMsg = normalizeText(message).split(" ").filter(Boolean).length < 3;
    const isLearnQuery = novaIntent.confidence > 0 && !shortMsg &&
      !text.includes("debug") && !text.includes("issue") && !text.includes("error") &&
      !text.includes("fix") && !text.includes("bug") && !text.includes("workflow problem");

    if (isLearnQuery) {
      const historyPrefix = (context.chatHistory || [])
        .slice(-4)
        .map((m) => `[${m.role.toUpperCase()}]: ${m.text}`)
        .join("\n");
      const questionWithHistory = historyPrefix
        ? `Recent conversation:\n${historyPrefix}\n\nCurrent question: ${message}`
        : message;
      const answer = await askGhlAssistant({ question: questionWithHistory, mode: "cross" });
      saveInteraction(agentId, message, answer);
      return {
        handledBy: "veronica",
        response: answer,
        data: {
          promptUsed: prompt,
          intent: "learn",
          confidence: novaIntent.confidence,
          sessionHints: { lastIntent: "learn" },
        },
      };
    }
    // ─────────────────────────────────────────────────────────────────────────

    const inferred = classifyVeronicaIntent(message, context);

    if (inferred.intent === "unknown" || inferred.confidence <= 0) {
      const response = buildClarification("unknown");
      saveInteraction(agentId, message, response);
      return {
        handledBy: "veronica",
        response,
        data: {
          promptUsed: prompt,
          intent: inferred.intent,
          confidence: inferred.confidence,
          sessionHints: {
            lastIntent: inferred.intent,
            workflowName: likelyWorkflow || context.workflowName || null,
          },
        },
      };
    }

    if (inferred.intent === "debug" && !likelyWorkflow) {
      const response = buildClarification("debug");
      saveInteraction(agentId, message, response);
      return {
        handledBy: "veronica",
        response,
        data: {
          promptUsed: prompt,
          intent: inferred.intent,
          confidence: inferred.confidence,
          sessionHints: {
            lastIntent: inferred.intent,
            workflowName: context.workflowName || null,
          },
        },
      };
    }

    if (inferred.intent === "context7") {
      const response = await getContext7Status();
      saveInteraction(agentId, message, response);
      return {
        handledBy: "veronica",
        response,
        data: {
          promptUsed: prompt,
          intent: inferred.intent,
          confidence: inferred.confidence,
          sessionHints: {
            lastIntent: inferred.intent,
            workflowName: likelyWorkflow || context.workflowName || null,
          },
        },
      };
    }

    if (inferred.intent === "visual") {
      if (!likelyWorkflow) {
        const response = buildClarification("visual");
        saveInteraction(agentId, message, response);
        return {
          handledBy: "veronica",
          response,
          data: {
            promptUsed: prompt,
            intent: inferred.intent,
            confidence: inferred.confidence,
            sessionHints: {
              lastIntent: inferred.intent,
              workflowName: context.workflowName || null,
            },
          },
        };
      }

      const response = await explainWorkflowVisualMap(message, {
        ...context,
        workflowName: likelyWorkflow,
      });
      saveInteraction(agentId, message, response);
      return {
        handledBy: "veronica",
        response,
        data: {
          promptUsed: prompt,
          intent: inferred.intent,
          confidence: inferred.confidence,
          sessionHints: {
            lastIntent: inferred.intent,
            workflowName: likelyWorkflow || context.workflowName || null,
          },
        },
      };
    }

    if (inferred.intent === "report") {
      const response = text.includes("brief analyzer report") || text.includes("brief report")
        ? await generateEndToEndWorkflowReport("brief")
        : text.includes("deep analyzer report") ||
            text.includes("deep report") ||
            text.includes("summary report") ||
            text.includes("end to end") ||
            text.includes("end-to-end") ||
            text.includes("analyzer report")
          ? await generateEndToEndWorkflowReport("deep")
          : await explainExistingWorkflows();
      saveInteraction(agentId, message, response);
      return {
        handledBy: "veronica",
        response,
        data: {
          promptUsed: prompt,
          intent: inferred.intent,
          confidence: inferred.confidence,
          sessionHints: {
            lastIntent: inferred.intent,
            workflowName: likelyWorkflow || context.workflowName || null,
          },
        },
      };
    }

    if (inferred.intent === "assets") {
      const response = await generateWorkflowLearningAssets(message);
      saveInteraction(agentId, message, response);
      return {
        handledBy: "veronica",
        response,
        data: {
          promptUsed: prompt,
          intent: inferred.intent,
          confidence: inferred.confidence,
          sessionHints: {
            lastIntent: inferred.intent,
            workflowName: likelyWorkflow || context.workflowName || null,
          },
        },
      };
    }

    if (inferred.intent === "debug") {
      const response = await diagnoseWorkflowIssue(message, {
        ...context,
        workflowName: likelyWorkflow,
      });
      saveInteraction(agentId, message, response);
      return {
        handledBy: "veronica",
        response,
        data: { promptUsed: prompt, intent: inferred.intent, confidence: inferred.confidence },
      };
    }

    const response = catalog.length
      ? `Veronica ready. I can see ${catalog.length} workflow exports in your folder. Tell me workflow name + issue, or say "existing workflows detail batao".`
      : "Veronica ready. Mujhe abhi workflows folder mein export JSON nahi mila. Echo se export kara ke do, phir main deep debugging start karungi.";

    saveInteraction(agentId, message, response);
    return {
      handledBy: "veronica",
      response,
      data: {
        promptUsed: prompt,
        workflowCount: catalog.length,
        sessionHints: {
          lastIntent: inferred.intent,
          workflowName: likelyWorkflow || context.workflowName || null,
        },
      },
    };
  }

  // ─── IRIS ───────────────────────────────────────────────────────────────────
  if (agentId === "iris") {
    // Process an incoming lead (survey or calendar booking)
    if (context.action === "intake") {
      const result = await processIntake(context.payload || {});
      if (!result.success) {
        const response = `❌ Lead intake failed:\n${result.errors.join("\n")}`;
        saveInteraction(agentId, message, response);
        return { handledBy: "iris", response, data: { errors: result.errors } };
      }
      const response = result.isNew
        ? `✅ New lead captured! ${result.lead.name || result.lead.email} → Stage: "${result.stage}".\nLead ID: ${result.leadId}`
        : `ℹ️ Lead already exists (${result.lead.name || result.lead.email}). Stage: "${result.lead.stage}".${
            result.stage !== result.lead.stage ? " Stage upgraded to meeting_scheduled." : ""
          }`;
      saveInteraction(agentId, message, response);
      return { handledBy: "iris", response, data: result };
    }

    // Get recent leads
    if (context.action === "recent-leads") {
      const leads = await getRecentLeads({ limit: context.limit || 20 });
      const response = leads.length
        ? `📋 ${leads.length} recent lead(s):\n${leads.map((l) => `• ${l.name || l.email} — ${l.stage} (${l.source})`).join("\n")}`
        : "No leads yet. Share your survey link or booking page to start capturing leads.";
      saveInteraction(agentId, message, response);
      return { handledBy: "iris", response, data: { leads } };
    }

    // Pipeline counts
    if (context.action === "pipeline-counts") {
      const counts = await getPipelineCounts();
      const response = `📊 Pipeline counts:\n${Object.entries(counts).map(([s, c]) => `• ${s}: ${c}`).join("\n")}`;
      saveInteraction(agentId, message, response);
      return { handledBy: "iris", response, data: { counts } };
    }

    // Default: show status
    const config = getIrisConfig();
    const counts = await getPipelineCounts();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const response = `I'm Iris 🌸 — Lead Intake Gateway.\n\nSupabase: ${config.supabaseConnected ? "✅ Connected" : "⚠️ Not connected (check SUPABASE env vars)"}\nTotal leads in pipeline: ${total}\n\nI activate on: survey form submissions and calendar bookings.\nSend me a payload with action: "intake" to capture a lead.`;
    saveInteraction(agentId, message, response);
    return { handledBy: "iris", response, data: { config, counts } };
  }

  // ─── DASH ────────────────────────────────────────────────────────────────────
  if (agentId === "dash") {
    // Get full board data
    if (context.action === "board") {
      const board = await getBoardData();
      const response = `📊 Pipeline board loaded. Total leads: ${board.totalCount}`;
      saveInteraction(agentId, message, response);
      return { handledBy: "dash", response, data: board };
    }

    // Move a lead stage
    if (context.action === "move-stage") {
      if (!context.leadId || !context.toStage) {
        const response = "❌ leadId and toStage required to move a lead.";
        saveInteraction(agentId, message, response);
        return { handledBy: "dash", response, data: { error: "missing params" } };
      }
      const result = await moveLeadStage({
        leadId: context.leadId,
        toStage: context.toStage,
        note: context.note || "",
        movedBy: context.movedBy || "user",
      });
      const response = `✅ Lead moved to "${context.toStage}".${result.followUpTrigger ? ` Follow-up triggered: ${result.followUpTrigger}` : ""}`;
      saveInteraction(agentId, message, response);
      return { handledBy: "dash", response, data: result };
    }

    // Lead detail
    if (context.action === "lead-detail") {
      if (!context.leadId) {
        return { handledBy: "dash", response: "❌ leadId required.", data: {} };
      }
      const detail = await getLeadDetail(context.leadId);
      const response = detail
        ? `Lead: ${detail.lead.name || detail.lead.email} — Stage: ${detail.lead.stage}\nHistory: ${detail.history.length} moves`
        : "Lead not found.";
      saveInteraction(agentId, message, response);
      return { handledBy: "dash", response, data: detail };
    }

    // Add note
    if (context.action === "add-note") {
      if (!context.leadId || !context.note) {
        return { handledBy: "dash", response: "❌ leadId and note required.", data: {} };
      }
      await addLeadNote({ leadId: context.leadId, note: context.note, addedBy: context.addedBy || "user" });
      const response = `✅ Note added to lead ${context.leadId}.`;
      saveInteraction(agentId, message, response);
      return { handledBy: "dash", response, data: { success: true } };
    }

    // Pipeline stats
    if (context.action === "stats") {
      const stats = await getPipelineStats();
      const response = `📈 Pipeline Stats:\n• Total leads: ${stats.totalLeads}\n• Client Won: ${stats.wonCount}\n• Conversion rate: ${stats.conversionRate}%`;
      saveInteraction(agentId, message, response);
      return { handledBy: "dash", response, data: stats };
    }

    // Default: board overview
    const config = getDashConfig();
    const stats = await getPipelineStats();
    const response = `I'm Dash 📊 — Pipeline Manager.\n\n${stats.totalLeads} total leads | ${stats.wonCount} won | ${stats.conversionRate}% conversion\n\nActions: board, move-stage, lead-detail, add-note, stats`;
    saveInteraction(agentId, message, response);
    return { handledBy: "dash", response, data: { config, stats } };
  }

  // ─── REX ────────────────────────────────────────────────────────────────────
  if (agentId === "rex") {
    if (context.action === "search") {
      const result = await searchLeads({
        query: context.industry || message,
        city: context.city || "",
        maxResults: context.maxResults || 50,
      });
      const response = `Found ${result.totalFound} results for "${result.query}" via ${result.source}. ${result.newLeads} new leads saved (${result.filtered} skipped — missing contact info).`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "rex",
        response,
        data: { ...result, sessionHints: { lastIntent: "search", industry: context.industry, city: context.city } },
      };
    }

    if (context.action === "get-leads") {
      const leads = await getLeads({ industry: context.industry, city: context.city });
      const response = `Showing ${leads.length} saved leads${context.industry ? ` for "${context.industry}"` : ""}.`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "rex",
        response,
        data: { leads, sessionHints: { lastIntent: "get-leads" } },
      };
    }

    if (context.action === "export-csv") {
      const csv = await exportLeadsCsv();
      const response = csv ? "CSV ready for download." : "No leads saved yet.";
      saveInteraction(agentId, message, response);
      return {
        handledBy: "rex",
        response,
        data: { csv, sessionHints: { lastIntent: "export-csv" } },
      };
    }

    if (context.action === "clear-leads") {
      await clearLeads();
      const response = "All saved leads cleared.";
      saveInteraction(agentId, message, response);
      return {
        handledBy: "rex",
        response,
        data: { sessionHints: { lastIntent: "clear-leads" } },
      };
    }

    const leads = await getLeads();
    const response = leads.length
      ? `Rex ready. ${leads.length} leads already saved. Search for more with industry + city, or click "Get Leads" to view the table.`
      : "Rex ready. Tell me: industry + city (e.g. 'dental clinic in Houston, TX') and I will start scouting!";
    saveInteraction(agentId, message, response);
    return {
      handledBy: "rex",
      response,
      data: { leads, sessionHints: { lastIntent: "ready" } },
    };
  }

  // ─── NORA ────────────────────────────────────────────────────────────────────
  if (agentId === "nora") {
    if (context.action === "generate-email-templates") {
      const template = await generateEmailTemplates({
        industry: context.industry || "business",
        senderName: context.senderName || "",
        customNote: context.customNote || "",
      });
      const response = `Email sequence created for "${template.industry}" (4 emails: intro, follow-up, proposal, final). Template ID: ${template.id}`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "nora",
        response,
        data: { template, sessionHints: { lastIntent: "email-templates", lastTemplateId: template.id } },
      };
    }

    if (context.action === "generate-proposal") {
      const template = await generateProposal({
        industry: context.industry || "business",
        leadName: context.leadName || "",
        businessName: context.businessName || "",
        painPoint: context.painPoint || message,
        senderName: context.senderName || "",
      });
      const response = `Proposal created for ${template.businessName || "the lead"}. Template ID: ${template.id}`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "nora",
        response,
        data: { template, sessionHints: { lastIntent: "proposal", lastTemplateId: template.id } },
      };
    }

    if (context.action === "generate-social-post") {
      const template = await generateSocialPost({
        industry: context.industry || "business",
        platform: context.platform || "linkedin",
        topic: context.topic || message,
        tone: context.tone || "professional",
      });
      const response = `${template.platform} post created for "${template.topic}". Template ID: ${template.id}`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "nora",
        response,
        data: { template, sessionHints: { lastIntent: "social-post", lastTemplateId: template.id } },
      };
    }

    if (context.action === "generate-ad-copy") {
      const template = await generateAdCopy({
        industry: context.industry || "business",
        platform: context.platform || "meta",
        offer: context.offer || message,
        targetAudience: context.targetAudience || "",
      });
      const response = `${template.platform} ad copy created for "${template.offer}". Template ID: ${template.id}`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "nora",
        response,
        data: { template, sessionHints: { lastIntent: "ad-copy", lastTemplateId: template.id } },
      };
    }

    if (context.action === "list-templates") {
      const templates = await listTemplates({ type: context.templateType });
      const response = templates.length
        ? `Found ${templates.length} saved templates.`
        : "No templates saved yet. Generate one by specifying industry and content type.";
      saveInteraction(agentId, message, response);
      return {
        handledBy: "nora",
        response,
        data: { templates, sessionHints: { lastIntent: "list-templates" } },
      };
    }

    if (context.action === "delete-template") {
      const result = await deleteTemplate(context.templateId);
      const response = `Template ${result.deleted} deleted.`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "nora",
        response,
        data: { ...result, sessionHints: { lastIntent: "delete-template" } },
      };
    }

    const templates = await listTemplates();
    const response = templates.length
      ? `Nora ready. ${templates.length} templates in library. Choose: email sequence, proposal, social post, or ad copy.`
      : "Nora ready. Tell me: industry + content type (email sequence / proposal / LinkedIn post / ad copy) and I will generate it.";
    saveInteraction(agentId, message, response);
    return {
      handledBy: "nora",
      response,
      data: { templates, sessionHints: { lastIntent: "ready" } },
    };
  }

  // ─── MAX ─────────────────────────────────────────────────────────────────────
  if (agentId === "max") {

    // Panel: connection status
    if (context.action === "get-max-status") {
      const config = getMaxConfig();
      return { handledBy: "max", response: "", data: config };
    }

    // Panel: get pipeline leads
    if (context.action === "get-pipeline-leads") {
      const leads = await getPipelineLeads({ stage: context.stage || undefined });
      return { handledBy: "max", response: "", data: { leads } };
    }

    // Panel: schedule a sequence for a lead
    if (context.action === "schedule-sequence") {
      if (!context.sequenceKey) return { handledBy: "max", response: "❌ sequenceKey required.", data: {} };
      if (!context.lead?.id) return { handledBy: "max", response: "❌ lead.id required.", data: {} };

      const sb = getSupabase();
      let lead = { ...context.lead };

      // Ensure intake_token exists (for new_lead_sequence)
      if (context.sequenceKey === "new_lead_sequence" && !lead.intakeToken && sb) {
        const token = generateIntakeToken();
        await sb.from("agency_leads").update({ intake_token: token }).eq("id", lead.id);
        lead.intakeToken = token;
      }

      const result = await scheduleSequence({ sequenceKey: context.sequenceKey, lead });
      return {
        handledBy: "max",
        response: `✅ ${result.scheduled} emails scheduled for sequence "${context.sequenceKey}".`,
        data: result,
      };
    }

    // Panel: outreach history for a lead
    if (context.action === "get-history") {
      if (!context.leadId) return { handledBy: "max", response: "❌ leadId required.", data: {} };
      const history = await getOutreachHistory({ leadId: context.leadId, limit: context.limit || 20 });
      return { handledBy: "max", response: "", data: { history } };
    }

    // Legacy: trigger-sequence (called by Dash or other agents after stage moves)
    if (context.action === "trigger-sequence") {
      if (!context.trigger) {
        return { handledBy: "max", response: "❌ trigger name required.", data: {} };
      }
      const result = await triggerSequence({
        trigger: context.trigger,
        lead: context.lead || {},
      });
      const response = `✅ Sequence "${context.trigger}" scheduled. ${result.scheduled || 0} steps queued.`;
      saveInteraction(agentId, message, response);
      return { handledBy: "max", response, data: { ...result, sessionHints: { lastIntent: "trigger-sequence" } } };
    }

    // Send a one-off email
    if (context.action === "send-email") {
      if (!context.to || !context.subject || (!context.html && !context.text)) {
        return { handledBy: "max", response: "❌ to, subject, and html/text required.", data: {} };
      }
      const result = await sendEmail({
        to: context.to,
        subject: context.subject,
        html: context.html,
        text: context.text,
        fromName: context.fromName,
        replyTo: context.replyTo,
      });
      const response = result.sent
        ? `✅ Email sent to ${result.to}.`
        : `📝 [DEV] Email logged (no SMTP configured). To: ${result.to}`;
      saveInteraction(agentId, message, response);
      return { handledBy: "max", response, data: { ...result, sessionHints: { lastIntent: "send-email" } } };
    }

    // Send a one-off WhatsApp
    if (context.action === "send-whatsapp") {
      if (!context.to || !context.message) {
        return { handledBy: "max", response: "❌ to and message required.", data: {} };
      }
      const result = await sendWhatsApp({ to: context.to, message: context.message });
      const response = result.sent
        ? `✅ WhatsApp sent to ${result.to}.`
        : `📝 [DEV] WhatsApp logged (no Twilio configured). To: ${result.to}`;
      saveInteraction(agentId, message, response);
      return { handledBy: "max", response, data: { ...result, sessionHints: { lastIntent: "send-whatsapp" } } };
    }

    // Default: show status
    const config = getMaxConfig();
    const response = `Max ready 📧\n\nEmail (Brevo): ${config.emailConnected ? "✅ Connected" : "⚠️ Not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS)"}\nWhatsApp (Twilio): ${config.whatsappConnected ? "✅ Connected" : "⚠️ Not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER)"}\n\nAvailable sequences:\n${config.sequences.join("\n")}`;
    saveInteraction(agentId, message, response);
    return { handledBy: "max", response, data: { config, sessionHints: { lastIntent: "ready" } } };
  }

  // ─── CAL ─────────────────────────────────────────────────────────────────────
  if (agentId === "cal") {
    if (context.action === "get-slots") {
      const slots = await getAvailableSlots({ daysAhead: context.daysAhead || 14 });
      const response = `${slots.length} available slots in the next ${context.daysAhead || 14} days.`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "cal",
        response,
        data: { slots, sessionHints: { lastIntent: "get-slots" } },
      };
    }

    if (context.action === "book") {
      const appt = await createAppointment({
        summary: context.summary || "Discovery Call",
        description: context.description || "",
        start: context.start,
        end: context.end,
        attendeeEmail: context.attendeeEmail,
        attendeeName: context.attendeeName,
      });
      const response = `Appointment booked: "${appt.summary}" on ${new Date(appt.start).toLocaleString()} with ${appt.attendeeName || appt.attendeeEmail}.`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "cal",
        response,
        data: { appointment: appt, sessionHints: { lastIntent: "book" } },
      };
    }

    if (context.action === "reschedule") {
      const appt = await rescheduleAppointment({
        appointmentId: context.appointmentId,
        newStart: context.newStart,
        newEnd: context.newEnd,
      });
      const response = `Appointment rescheduled to ${new Date(appt.start).toLocaleString()}.`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "cal",
        response,
        data: { appointment: appt, sessionHints: { lastIntent: "reschedule" } },
      };
    }

    if (context.action === "cancel") {
      const appt = await cancelAppointment({ appointmentId: context.appointmentId });
      const response = `Appointment "${appt.summary}" cancelled.`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "cal",
        response,
        data: { appointment: appt, sessionHints: { lastIntent: "cancel" } },
      };
    }

    if (context.action === "booking-link") {
      const result = await generateBookingLink({
        meetingTitle: context.meetingTitle || "Discovery Call",
        durationMinutes: context.durationMinutes || 30,
      });
      const response = `Booking link generated. Use it in your email campaigns where [BOOKING_LINK] appears.`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "cal",
        response,
        data: { ...result, sessionHints: { lastIntent: "booking-link" } },
      };
    }

    if (context.action === "list-appointments") {
      const appointments = await listAppointments({ status: context.status });
      const response = `${appointments.length} appointments${context.status ? ` (${context.status})` : ""}.`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "cal",
        response,
        data: { appointments, sessionHints: { lastIntent: "list-appointments" } },
      };
    }

    const appointments = await listAppointments();
    const booked = appointments.filter((a) => a.status === "booked").length;
    const rescheduled = appointments.filter((a) => a.status === "rescheduled").length;
    const response = `Cal ready. ${booked} upcoming | ${rescheduled} rescheduled. Get available slots, generate a booking link, or view all appointments.`;
    saveInteraction(agentId, message, response);
    return {
      handledBy: "cal",
      response,
      data: { appointments, sessionHints: { lastIntent: "ready" } },
    };
  }

  if (agentId === "orchestrator") {
    const response =
      "I am Luna 🌙, your Mission Control. Tell me your task and I will route it to Iris, Dash, Veronica, Echo, Sara, Rex, Nora, Max, or Cal and bring back the final response.";
    saveInteraction(agentId, message, response);
    return {
      handledBy: "orchestrator",
      response,
      data: { promptUsed: prompt },
    };
  }

  const response = "No matching agent handler was found.";
  saveInteraction("orchestrator", message, response);
  return {
    handledBy: "orchestrator",
    response,
  };
}
