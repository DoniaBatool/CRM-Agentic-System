/**
 * Iris — Lead Intake Agent (OpenAI Agents SDK)
 *
 * Wraps iris-agent.js pure functions as SDK tools.
 * Does NOT touch Echo (workflow-export) or Ayla (survey-tester).
 */

import { Agent, tool } from "@openai/agents";
import { z } from "zod";
import {
  processIntake,
  getRecentLeads,
  getPipelineCounts,
  getIrisConfig,
} from "../iris-agent.js";

// ─── Status tool ─────────────────────────────────────────────────────────────

const getStatusTool = tool({
  name: "get_status",
  description: "Check Iris agent status — Supabase connection, pipeline stages. When to call: when user asks if Iris is connected or what stages are available.",
  parameters: z.object({}),
  execute: async () => JSON.stringify(getIrisConfig()),
});

// ─── Tools ───────────────────────────────────────────────────────────────────

const processIntakeTool = tool({
  name: "process_intake",
  description:
    "Process a new dental practice lead from a survey form or calendar booking. Validates, normalizes, and saves to the pipeline.",
  parameters: z.object({
    name: z.string().describe("Lead full name"),
    email: z.string().nullable().describe("Lead email address"),
    phone: z.string().nullable().describe("Lead phone number"),
    clinic_name: z.string().nullable().describe("Dental clinic or business name"),
    city: z.string().nullable().describe("City where the practice is located"),
    source: z
      .enum(["survey", "calendar_booking", "manual"])
      .nullable()
      .describe("How the lead was captured"),
    meeting_datetime: z
      .string()
      .nullable()
      .describe("ISO datetime string — required for calendar_booking source"),
    message: z.string().nullable().describe("Notes or message from the lead"),
  }),
  execute: async (params) => {
    const result = await processIntake(params);
    return JSON.stringify(result);
  },
});

const getRecentLeadsTool = tool({
  name: "get_recent_leads",
  description: "Get recently captured leads from the pipeline, ordered by newest first.",
  parameters: z.object({
    limit: z.number().nullable().describe("Max number of leads to return (default 20)"),
  }),
  execute: async ({ limit } = {}) => {
    const leads = await getRecentLeads({ limit: limit || 20 });
    return JSON.stringify({ count: leads.length, leads });
  },
});

const getPipelineCountsTool = tool({
  name: "get_pipeline_counts",
  description: "Get lead counts per pipeline stage — useful for a quick pipeline overview.",
  parameters: z.object({}),
  execute: async () => {
    const counts = await getPipelineCounts();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return JSON.stringify({ total, byStage: counts });
  },
});

// ─── Agent ───────────────────────────────────────────────────────────────────

export const irisAgent = new Agent({
  name: "Iris",
  instructions: `You are Iris 🌸, the Lead Intake Gateway for DentaFlow — a dental marketing agency platform.

Your job:
- Capture dental practice leads from survey forms or calendar bookings
- Validate required fields: name + (email or phone)
- If a lead already exists (same email/phone), return existing — don't create a duplicate
- If source is calendar_booking, set stage to meeting_scheduled; otherwise new_lead
- Provide pipeline summaries when asked

Pipeline stages: new_lead → meeting_scheduled → showed_up → interested → client_won

Always call process_intake when given lead data. Use get_recent_leads for pipeline overview.
If validation fails, clearly list which fields are missing.`,
  tools: [processIntakeTool, getRecentLeadsTool, getPipelineCountsTool, getStatusTool],
});
