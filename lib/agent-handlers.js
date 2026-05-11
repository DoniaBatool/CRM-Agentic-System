import { askGhlAssistant } from "../ghl-assistant.js";
import {
  deleteExportedWorkflowFiles,
  exportSelectedWorkflows,
  listExportedWorkflowFiles,
  listWorkflows,
} from "../workflow-agent.js";
import { getSuggestedDateTime, getWebhookMap, searchContacts, triggerWorkflowWebhook } from "../ghl-webhook-trigger.js";
import {
  diagnoseWorkflowIssue,
  explainWorkflowVisualMap,
  explainExistingWorkflows,
  generateEndToEndWorkflowReport,
  generateWorkflowLearningAssets,
  getContext7Status,
  loadWorkflowCatalog,
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
  addLeadsToMailchimp,
  createDripSequence,
  sendCampaign,
  getCampaignStats,
  listCampaigns,
  getAudienceInfo,
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
import { getSystemPrompt, saveInteraction } from "./self-learning.js";

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
      "Hi! I am Luna 🌙. I am doing great and ready to help. Share your goal and I will route it to the right specialist (Nova for learning, Veronica for workflow debugging, Echo for exports, Sara for CRM actions). How can I help you today?",
    "ghl-assistant":
      "Hi! I am Nova 👋, doing well. I can help explain GHL concepts, workflow logic, and practical automation scenarios. What do you want to learn today?",
    "workflow-export":
      "Hi! I am Echo ⚙️, doing great. I can help you export workflow JSON from any GHL sub-account. Want to start with the sub-account name?",
    "workflow-tester":
      "Hi! I am Sara 🎯, doing well. I can help trigger CRM workflow actions via webhook using a contact and event type. Which contact should we start with?",
    veronica:
      "Hi! I am Veronica 🧠, doing great. I can debug your existing GHL workflows using your exported JSON plus NotebookLM context. Share workflow name and issue, and I will help you fix it.",
    rex:
      "Hi! I am Rex 🔍, doing great. I find business leads from Google Maps. Tell me industry + city (e.g. 'dental clinic in Houston') and I will scout qualified prospects for you.",
    nora:
      "Hi! I am Nora ✍️, doing well. I create email templates, proposals, social posts, and ad copy. Tell me the industry and what content you need.",
    max:
      "Hi! I am Max 📧, ready to go. I manage your Mailchimp campaigns and email drip sequences. Select leads from Rex and a template from Nora, and I will set up the full sequence.",
    cal:
      "Hi! I am Cal 📅, doing great. I manage your Google Calendar appointments. I can show available slots, create bookings, handle reschedules, and send you notifications.",
    "survey-tester":
      "Hi! I am Ayla 🧪, ready to help. I auto-fill and submit surveys/forms using your saved users. Load config and I will handle the rest.",
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

  if (agentId === "ghl-assistant") {
    const novaIntent = classifyNovaIntent(message);
    const shortMsg = normalizeText(message).split(" ").filter(Boolean).length < 3;
    if (novaIntent.confidence <= 0 || shortMsg) {
      const response =
        "Main Nova hoon 👋. Mujhe better guide karne ke liye topic batao: kaunsa GHL concept, workflow scenario, ya automation issue samajhna hai? Agar chaho to format bhi bolo (quiz, flashcards, slides, infographic, audio).";
      saveInteraction(agentId, message, response);
      return {
        handledBy: "ghl-assistant",
        response,
        data: {
          promptUsed: prompt,
          intent: novaIntent.intent,
          confidence: novaIntent.confidence,
          sessionHints: { lastIntent: novaIntent.intent },
        },
      };
    }

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
      handledBy: "ghl-assistant",
      response: answer,
      data: {
        promptUsed: prompt,
        intent: novaIntent.intent,
        confidence: novaIntent.confidence,
        sessionHints: { lastIntent: novaIntent.intent },
      },
    };
  }

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
      const response = `Exported ${result.exportedCount} workflows to \`${result.outputDir}\`.`;
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

    if (context.action === "list-exported-json") {
      const result = listExportedWorkflowFiles({
        subAccountName: context.subAccountName,
      });
      const response = `Found ${result.files.length} exported JSON files in \`${result.outputDir}\`.`;
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

  if (agentId === "workflow-tester") {
    const saraIntent = classifySaraIntent(message, context);
    if (saraIntent.intent === "unknown") {
      const response =
        "Main Sara hoon 🎯. Aap contact search karna chahte hain ya webhook trigger? Example: `contact: Ali` ya `trigger treatment booked`.";
      saveInteraction(agentId, message, response);
      return {
        handledBy: "workflow-tester",
        response,
        data: {
          intent: saraIntent.intent,
          confidence: saraIntent.confidence,
          sessionHints: { lastIntent: saraIntent.intent },
        },
      };
    }

    if (saraIntent.intent === "search-contact") {
      const shortMsg = normalizeText(message).split(" ").filter(Boolean).length < 2;
      if (shortMsg) {
        const response = "Contact ka naam do taake main search kar sakun. Example: `contact: Ali Khan`";
        saveInteraction(agentId, message, response);
        return {
          handledBy: "workflow-tester",
          response,
          data: {
            intent: saraIntent.intent,
            confidence: saraIntent.confidence,
            sessionHints: { lastIntent: saraIntent.intent },
          },
        };
      }

      const contacts = await searchContacts(message);
      const response = `Found ${contacts.length} contacts.`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "workflow-tester",
        response,
        data: {
          contacts,
          intent: saraIntent.intent,
          confidence: saraIntent.confidence,
          sessionHints: { lastIntent: saraIntent.intent },
        },
      };
    }

    if (saraIntent.intent === "trigger-webhook") {
      if (!context.webhookUrl || !context.payload) {
        const response =
          "Webhook trigger ke liye mujhe `webhookUrl` aur `payload` chahiye. Agar chaho to pehle contact search karke flow prepare karte hain.";
        saveInteraction(agentId, message, response);
        return {
          handledBy: "workflow-tester",
          response,
          data: {
            intent: saraIntent.intent,
            confidence: saraIntent.confidence,
            sessionHints: { lastIntent: saraIntent.intent },
          },
        };
      }

      const result = await triggerWorkflowWebhook({
        webhookUrl: context.webhookUrl,
        payload: context.payload,
      });
      const response = `Webhook sent: ${result.status} ${result.statusText}`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "workflow-tester",
        response,
        data: {
          result: result.data,
          intent: saraIntent.intent,
          confidence: saraIntent.confidence,
          sessionHints: { lastIntent: saraIntent.intent },
        },
      };
    }

    const response =
      "Sara is ready. Use context.action as `search-contact` or `trigger-webhook`.";
    saveInteraction(agentId, message, response);
    return {
      handledBy: "workflow-tester",
      response,
      data: {
        webhookMap: getWebhookMap(),
        suggestedDateTime: getSuggestedDateTime(),
      },
    };
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
    const text = (message || "").toLowerCase();
    const catalog = await loadWorkflowCatalog();
    const inferred = classifyVeronicaIntent(message, context);
    const likelyWorkflow = context.workflowName || pickLikelyWorkflowName(message, catalog);

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
    if (context.action === "add-leads") {
      const result = await addLeadsToMailchimp(context.leads || []);
      const response = `Added ${result.added} contacts to Mailchimp audience. ${result.errors} errors.`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "max",
        response,
        data: { ...result, sessionHints: { lastIntent: "add-leads" } },
      };
    }

    if (context.action === "create-drip") {
      const result = await createDripSequence({
        templateId: context.templateId,
        industry: context.industry || "",
        fromName: context.fromName || "",
        replyTo: context.replyTo || "",
        bookingLink: context.bookingLink || "",
      });
      const response = `Drip sequence created: ${result.totalEmails} emails (Day 1/3/7/14). Campaign IDs: ${result.sequence.map((s) => s.campaignId).join(", ")}`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "max",
        response,
        data: { ...result, sessionHints: { lastIntent: "create-drip" } },
      };
    }

    if (context.action === "send-campaign") {
      const result = await sendCampaign(context.campaignId);
      const response = `Campaign ${result.campaignId} sent successfully.`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "max",
        response,
        data: { ...result, sessionHints: { lastIntent: "send-campaign" } },
      };
    }

    if (context.action === "campaign-stats") {
      const stats = await getCampaignStats(context.campaignId);
      const response = `Campaign "${stats.subject}" — Status: ${stats.status} | Opens: ${stats.uniqueOpens} (${stats.openRate}) | Clicks: ${stats.uniqueClicks} (${stats.clickRate})`;
      saveInteraction(agentId, message, response);
      return {
        handledBy: "max",
        response,
        data: { stats, sessionHints: { lastIntent: "campaign-stats" } },
      };
    }

    if (context.action === "list-campaigns") {
      const campaigns = await listCampaigns();
      const audience = await getAudienceInfo().catch(() => null);
      const response = campaigns.length
        ? `${campaigns.length} campaigns found. Audience: ${audience?.memberCount || "?"} contacts.`
        : "No campaigns yet. Add leads from Rex and create a drip sequence.";
      saveInteraction(agentId, message, response);
      return {
        handledBy: "max",
        response,
        data: { campaigns, audience, sessionHints: { lastIntent: "list-campaigns" } },
      };
    }

    const [campaigns, audience] = await Promise.all([
      listCampaigns().catch(() => []),
      getAudienceInfo().catch(() => null),
    ]);
    const response = `Max ready. Audience: ${audience?.memberCount || 0} contacts. ${campaigns.length} campaigns. Select leads from Rex + a template from Nora to start a drip sequence.`;
    saveInteraction(agentId, message, response);
    return {
      handledBy: "max",
      response,
      data: { campaigns, audience, sessionHints: { lastIntent: "ready" } },
    };
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
      "I am Luna 🌙, your Mission Control. Tell me your task and I will route it to Nova, Veronica, Echo, Sara, Rex, Nora, Max, or Cal and bring back the final response.";
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
