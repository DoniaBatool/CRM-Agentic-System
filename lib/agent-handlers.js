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
import { AGENT_BY_ID } from "./agents.js";
import { getSystemPrompt, saveInteraction } from "./self-learning.js";

function isGreetingMessage(message) {
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

    const answer = await askGhlAssistant({ question: message, mode: "cross" });
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

    const workflows = await listWorkflows({
      locationId: context.locationId,
      token: context.token,
    });
    const workflowOptions = workflows.map((wf) => ({
      id: wf.id,
      name: wf.name,
      status: wf.status || "N/A",
    }));
    const response = `Found ${workflowOptions.length} workflows. Select the ones you want to export.`;
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

  if (agentId === "orchestrator") {
    const response =
      "I am Luna 🌙, your Mission Control. Tell me your task and I will route it to Nova, Veronica, Echo, or Sara and bring back the final response.";
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
