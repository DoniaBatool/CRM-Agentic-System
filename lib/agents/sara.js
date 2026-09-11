/**
 * Sara — Workflow Tester Agent (OpenAI Agents SDK)
 *
 * Wraps lib/sara-agent.js pure functions as SDK tools.
 * Also wraps legacy ghl-webhook-trigger.js searchContacts.
 */

import { Agent, tool } from "@openai/agents";
import { z } from "zod";
import { searchContacts } from "../../ghl-webhook-trigger.js";
import {
  fireWebhook,
  saveWebhookHistory,
  getBuiltInWebhookMap,
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
  BUILT_IN_EVENT_LABELS,
} from "../sara-agent.js";

// ─── Tools ────────────────────────────────────────────────────────────────────

const searchContactsTool = tool({
  name: "search_contacts",
  description: "Search GHL contacts by name. Returns id, name, email, phone.",
  parameters: z.object({
    query: z.string().describe("Contact name to search for"),
  }),
  execute: async ({ query }) => {
    const contacts = await searchContacts(query);
    return JSON.stringify({
      count: contacts.length,
      contacts: contacts.map((c) => ({
        id:        c.id,
        name:      c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim(),
        firstName: c.firstName || "",
        lastName:  c.lastName  || "",
        email:     c.email || null,
        phone:     c.phone || null,
      })),
    });
  },
});

const fireWebhookTool = tool({
  name: "fire_webhook",
  description: "Fire a webhook to trigger a GHL workflow and save result to history.",
  parameters: z.object({
    webhookUrl:   z.string().describe("The webhook URL to POST to"),
    contactName:  z.string().nullable(),
    contactEmail: z.string().nullable(),
    contactPhone: z.string().nullable(),
    eventType:    z.string().describe("Event type, e.g. 'treatment' or 'Personal Consultation'"),
    action:       z.enum(["booked", "rescheduled"]),
    payload:      z.record(z.unknown()).describe("Full payload to POST"),
  }),
  execute: async ({ webhookUrl, contactName, contactEmail, contactPhone, eventType, action, payload }) => {
    const result = await fireWebhook({ webhookUrl, payload });
    await saveWebhookHistory({
      contactName, contactEmail, contactPhone,
      eventType, action, webhookUrl, payload,
      statusCode:   result.status_code,
      statusText:   result.status_text,
      responseBody: result.response_body,
      success:      result.success,
    });
    return JSON.stringify(result);
  },
});

const getWebhookMapTool = tool({
  name: "get_webhook_map",
  description: "Get all configured webhook URLs (built-in + custom events).",
  parameters: z.object({}),
  execute: async () => {
    const builtIn = getBuiltInWebhookMap();
    const custom  = await getCustomEvents();
    return JSON.stringify({ builtIn, custom, builtInLabels: BUILT_IN_EVENT_LABELS });
  },
});

const getHistoryTool = tool({
  name: "get_webhook_history",
  description: "Get recent webhook fire history from Supabase.",
  parameters: z.object({
    limit:      z.number().nullable().describe("Max rows to return (default 50)"),
    onlyFailed: z.boolean().nullable().describe("Return only failed webhooks"),
  }),
  execute: async ({ limit, onlyFailed }) => {
    const rows = await getWebhookHistory({ limit: limit || 50, onlyFailed: onlyFailed || false });
    return JSON.stringify({ count: rows.length, history: rows });
  },
});

const retryWebhookTool = tool({
  name: "retry_webhook",
  description: "Retry a previously fired webhook by its history ID.",
  parameters: z.object({
    historyId: z.string().describe("UUID of the webhook_history row to retry"),
  }),
  execute: async ({ historyId }) => {
    const result = await retryWebhook(historyId);
    return JSON.stringify(result);
  },
});

const bulkFireTool = tool({
  name: "bulk_fire_webhooks",
  description: "Fire the same webhook event for multiple contacts at once.",
  parameters: z.object({
    contacts: z.array(z.object({
      name:      z.string().nullable(),
      firstName: z.string().nullable(),
      lastName:  z.string().nullable(),
      email:     z.string().nullable(),
      phone:     z.string().nullable(),
    })),
    eventType:  z.string(),
    action:     z.enum(["booked", "rescheduled"]),
    webhookUrl: z.string().describe("Webhook URL to fire for all contacts"),
  }),
  execute: async ({ contacts, eventType, action, webhookUrl }) => {
    const results = await bulkFireWebhooks({ contacts, eventType, action, webhookUrl });
    return JSON.stringify({ count: results.length, results });
  },
});

const healthCheckTool = tool({
  name: "health_check_webhooks",
  description: "Ping all configured webhook URLs and report which are live, pending, or dead.",
  parameters: z.object({}),
  execute: async () => {
    const custom  = await getCustomEvents();
    const results = await healthCheckWebhooks(custom);
    return JSON.stringify(results);
  },
});

const getCustomEventsTool = tool({
  name: "get_custom_events",
  description: "Get all user-defined custom event types saved in Supabase.",
  parameters: z.object({}),
  execute: async () => {
    const events = await getCustomEvents();
    return JSON.stringify({ count: events.length, events });
  },
});

const saveCustomEventTool = tool({
  name: "save_custom_event",
  description: "Save a new custom event type with its webhook URL.",
  parameters: z.object({
    eventLabel:      z.string().describe("Display name, e.g. 'Whitening Booked'"),
    eventType:       z.string().describe("Payload value, e.g. 'Whitening'"),
    action:          z.enum(["booked", "rescheduled"]),
    webhookUrl:      z.string().nullable(),
    payloadTemplate: z.record(z.unknown()).nullable(),
  }),
  execute: async (args) => {
    const event = await saveCustomEvent(args);
    return JSON.stringify(event);
  },
});

const deleteCustomEventTool = tool({
  name: "delete_custom_event",
  description: "Delete a custom event type by ID.",
  parameters: z.object({ id: z.string() }),
  execute: async ({ id }) => JSON.stringify(await deleteCustomEvent(id)),
});

const getTemplatesTool = tool({
  name: "get_payload_templates",
  description: "Get all saved payload templates.",
  parameters: z.object({}),
  execute: async () => {
    const templates = await getPayloadTemplates();
    return JSON.stringify({ count: templates.length, templates });
  },
});

const saveTemplateTool = tool({
  name: "save_payload_template",
  description: "Save current payload as a named template for reuse.",
  parameters: z.object({
    name:      z.string(),
    eventType: z.string().nullable(),
    action:    z.enum(["booked", "rescheduled"]).nullable(),
    payload:   z.record(z.unknown()),
  }),
  execute: async (args) => JSON.stringify(await savePayloadTemplate(args)),
});

const deleteTemplateTool = tool({
  name: "delete_payload_template",
  description: "Delete a payload template by ID.",
  parameters: z.object({ id: z.string() }),
  execute: async ({ id }) => JSON.stringify(await deletePayloadTemplate(id)),
});

// ─── Agent ────────────────────────────────────────────────────────────────────

export const saraAgent = new Agent({
  name: "Sara",
  instructions: `You are Sara 🎯, the Workflow Tester for DentaFlow — a dental marketing agency platform.

Your job:
- Test GHL (GoHighLevel) workflows by firing webhook triggers
- Search for contacts by name, then build and send a webhook payload
- Track webhook history and allow retrying failed ones
- Manage custom event types and payload templates
- Health-check all configured webhook URLs

Built-in event types: Treatment Booked, Treatment Rescheduled, Personal Consultation Booked, Personal Consultation Rescheduled.

Typical flow:
1. User says they want to test a workflow
2. You search for the contact by name
3. You confirm which event type + action to trigger
4. You resolve the webhook URL (from map or user provides a custom URL)
5. You show the payload preview and confirm before firing
6. You fire the webhook and save to history

Always confirm the full payload with the user before firing.
If a webhook URL is not configured (null/PENDING), tell the user to add it to .env or use a custom URL.`,

  tools: [
    searchContactsTool,
    fireWebhookTool,
    getWebhookMapTool,
    getHistoryTool,
    retryWebhookTool,
    bulkFireTool,
    healthCheckTool,
    getCustomEventsTool,
    saveCustomEventTool,
    deleteCustomEventTool,
    getTemplatesTool,
    saveTemplateTool,
    deleteTemplateTool,
  ],
});
