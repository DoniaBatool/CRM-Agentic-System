import { askGhlAssistant } from "../ghl-assistant.js";
import { listWorkflows, } from "../workflow-agent.js";
import { getSuggestedDateTime, getWebhookMap, searchContacts, triggerWorkflowWebhook } from "../ghl-webhook-trigger.js";

export async function runAgent(agentId, message, context = {}) {
  if (agentId === "ghl-assistant") {
    const answer = await askGhlAssistant({ question: message, mode: "cross" });
    return { handledBy: "ghl-assistant", response: answer };
  }

  if (agentId === "workflow-export") {
    if (!context.locationId || !context.token) {
      return {
        handledBy: "workflow-export",
        response: "Provide `locationId` and `token` in context to list workflows.",
      };
    }
    const workflows = await listWorkflows({
      locationId: context.locationId,
      token: context.token,
    });
    return {
      handledBy: "workflow-export",
      response: `Found ${workflows.length} workflows.`,
      data: workflows,
    };
  }

  if (agentId === "workflow-tester") {
    if (context.action === "search-contact") {
      const contacts = await searchContacts(message);
      return {
        handledBy: "workflow-tester",
        response: `Found ${contacts.length} contacts.`,
        data: contacts,
      };
    }

    if (context.action === "trigger-webhook") {
      const result = await triggerWorkflowWebhook({
        webhookUrl: context.webhookUrl,
        payload: context.payload,
      });
      return {
        handledBy: "workflow-tester",
        response: `Webhook sent: ${result.status} ${result.statusText}`,
        data: result.data,
      };
    }

    return {
      handledBy: "workflow-tester",
      response:
        "Workflow Tester is ready. Use context.action as `search-contact` or `trigger-webhook`.",
      data: {
        webhookMap: getWebhookMap(),
        suggestedDateTime: getSuggestedDateTime(),
      },
    };
  }

  return {
    handledBy: "orchestrator",
    response: "No matching agent handler was found.",
  };
}
