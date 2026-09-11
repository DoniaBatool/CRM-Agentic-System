/**
 * Max — Outreach Agent (OpenAI Agents SDK)
 *
 * Wraps max-agent.js pure functions as SDK tools.
 */

import { Agent, tool } from "@openai/agents";
import { z } from "zod";
import {
  sendEmail,
  sendWhatsApp,
  triggerSequence,
  scheduleSequence,
  getOutreachHistory,
  getPipelineLeads,
  getMaxConfig,
  SEQUENCES,
} from "../max-agent.js";

// ─── Tools ───────────────────────────────────────────────────────────────────

const triggerSequenceTool = tool({
  name: "trigger_sequence",
  description:
    "Schedule a named follow-up sequence for a lead. Inserts pending rows into outreach_schedule table. A Vercel cron sends them at the right time.",
  parameters: z.object({
    sequenceKey: z
      .enum([
        "new_lead_sequence",
        "interested_sequence",
        "pre_meeting_reminder",
        "no_show_reschedule",
        "not_interested_reengagement",
        "long_term_nurture",
        "post_meeting_follow_up",
        "onboarding_handoff",
      ])
      .describe("Which sequence to schedule"),
    lead: z
      .object({
        id:              z.string().describe("Supabase agency_leads UUID — required"),
        name:            z.string().nullable(),
        email:           z.string().nullable(),
        phone:           z.string().nullable(),
        clinicName:      z.string().nullable(),
        city:            z.string().nullable(),
        bookingLink:     z.string().nullable(),
        meetingDatetime: z.string().nullable().describe("ISO datetime — required for pre_meeting_reminder"),
        meetingLink:     z.string().nullable(),
        source:          z.string().nullable(),
        intakeToken:     z.string().nullable().describe("Unique token for /intake/[token] form link"),
      })
      .describe("Lead data for personalizing messages"),
  }),
  execute: async ({ sequenceKey, lead }) => {
    const result = await scheduleSequence({ sequenceKey, lead });
    return JSON.stringify(result);
  },
});

const sendEmailTool = tool({
  name: "send_email",
  description: "Send a single one-off email via Brevo SMTP immediately (not scheduled).",
  parameters: z.object({
    to:       z.string().describe("Recipient email address"),
    subject:  z.string().describe("Email subject line"),
    html:     z.string().nullable().describe("HTML email body"),
    text:     z.string().nullable().describe("Plain text email body"),
    fromName: z.string().nullable().describe("Sender display name"),
    replyTo:  z.string().nullable().describe("Reply-to email address"),
  }),
  execute: async ({ to, subject, html, text, fromName, replyTo }) => {
    const result = await sendEmail({ to, subject, html, text, fromName, replyTo });
    return JSON.stringify(result);
  },
});

const sendWhatsAppTool = tool({
  name: "send_whatsapp",
  description: "Send a single WhatsApp message via Twilio immediately.",
  parameters: z.object({
    to:      z.string().describe("Recipient phone with country code, e.g. +921234567890"),
    message: z.string().describe("WhatsApp message text"),
  }),
  execute: async ({ to, message }) => {
    const result = await sendWhatsApp({ to, message });
    return JSON.stringify(result);
  },
});

const getHistoryTool = tool({
  name: "get_outreach_history",
  description: "Get the outreach send history for a specific lead (sent, pending, failed rows).",
  parameters: z.object({
    leadId: z.string().describe("agency_leads UUID"),
    limit:  z.number().nullable().describe("Max rows (default 20)"),
  }),
  execute: async ({ leadId, limit }) => {
    const rows = await getOutreachHistory({ leadId, limit: limit ?? 20 });
    return JSON.stringify({ count: rows.length, history: rows });
  },
});

const getLeadsTool = tool({
  name: "get_pipeline_leads",
  description: "Get pipeline leads for Max to select and schedule sequences for.",
  parameters: z.object({
    stage: z.string().nullable().describe("Filter by pipeline stage (e.g. new_lead, interested)"),
  }),
  execute: async ({ stage }) => {
    const leads = await getPipelineLeads({ stage: stage ?? undefined });
    return JSON.stringify({ count: leads.length, leads });
  },
});

const getStatusTool = tool({
  name: "get_max_status",
  description: "Check Max's connection status — whether SMTP (Brevo) and WhatsApp (Twilio) are configured.",
  parameters: z.object({}),
  execute: async () => {
    const config = getMaxConfig();
    return JSON.stringify(config);
  },
});

// ─── Agent ───────────────────────────────────────────────────────────────────

const sequenceList = Object.entries(SEQUENCES)
  .map(([key, seq]) => `  - ${key}: ${seq.name}`)
  .join("\n");

export const maxAgent = new Agent({
  name: "Max",
  instructions: `You are Max 📧, the Outreach Agent for DentaFlow — a dental marketing agency platform.

Your job:
- Schedule email + WhatsApp follow-up sequences when leads move through the pipeline
- Send one-off emails or WhatsApp messages when requested
- Look up outreach history for a lead
- Each sequence is designed for a specific pipeline stage

Available sequences:
${sequenceList}

Stage → Sequence mapping:
- new_lead           → new_lead_sequence (welcome email + form link + 3 follow-ups)
- interested         → interested_sequence (booking link + 4 reminders)
- meeting_scheduled  → pre_meeting_reminder (3d / 24h / 1h before — need meetingDatetime)
- no_show            → no_show_reschedule (4 reschedule emails)
- not_interested     → not_interested_reengagement (4 re-engagement emails)
- long_term_nurture  → long_term_nurture (monthly tips)
- showed_up          → post_meeting_follow_up (thank you + proposal)
- client_won         → onboarding_handoff (notify Donia)

IMPORTANT: pre_meeting_reminder requires lead.meetingDatetime (ISO string).
If SMTP/Twilio are not configured, messages log to console (dev mode) — tell the user which env vars are missing.

CONVERSATION CONTINUITY: If you already found or displayed a lead in the previous turn, use that lead's details directly in follow-up actions. Never ask "which lead?" if it was identified in the immediately preceding turn.`,
  tools: [triggerSequenceTool, sendEmailTool, sendWhatsAppTool, getHistoryTool, getLeadsTool, getStatusTool],
});
