/**
 * Dash — Pipeline Manager Agent (OpenAI Agents SDK)
 *
 * Wraps dash-agent.js pure functions as SDK tools.
 */

import { Agent, tool } from "@openai/agents";
import { z } from "zod";
import {
  forceMoveLeadStage,
  getBoardData,
  getLeadDetail,
  addLeadNote,
  getPipelineStats,
  getDashConfig,
  searchLeadsByName,
} from "../dash-agent.js";

// ─── Tools ───────────────────────────────────────────────────────────────────

const searchLeadsTool = tool({
  name: "search_leads",
  description:
    "Search for leads by name (partial match). Use this FIRST when the user mentions a lead by name instead of UUID. Returns matching leads with their IDs, current stage, clinic, etc.",
  parameters: z.object({
    name: z.string().describe("Lead name or partial name to search for"),
  }),
  execute: async ({ name }) => {
    const results = await searchLeadsByName(name);
    if (!results.length) return JSON.stringify({ found: false, message: `No leads found matching "${name}"` });
    return JSON.stringify({ found: true, count: results.length, leads: results });
  },
});

const moveLeadStageTool = tool({
  name: "move_lead_stage",
  description:
    "Move a lead to ANY pipeline stage — no transition restrictions. Use forceMoveLeadStage internally. If user gives a name instead of UUID, use search_leads first to get the ID.",
  parameters: z.object({
    leadId: z.string().describe("UUID of the lead to move"),
    toStage: z
      .enum([
        "new_lead",
        "meeting_scheduled",
        "showed_up",
        "no_show",
        "interested",
        "not_interested",
        "long_term_follow_up",
        "client_won",
      ])
      .describe("Target stage — any stage is allowed, no restrictions"),
    note: z.string().nullable().describe("Optional note explaining the move"),
  }),
  execute: async ({ leadId, toStage, note }) => {
    const result = await forceMoveLeadStage({ leadId, toStage, note: note || "" });
    return JSON.stringify(result);
  },
});

const getBoardDataTool = tool({
  name: "get_board_data",
  description: "Get all pipeline leads grouped by stage — the full Kanban board view.",
  parameters: z.object({}),
  execute: async () => {
    const board = await getBoardData();
    return JSON.stringify(board);
  },
});

const getLeadDetailTool = tool({
  name: "get_lead_detail",
  description: "Get full detail for a single lead including complete stage history.",
  parameters: z.object({
    leadId: z.string().describe("UUID of the lead"),
  }),
  execute: async ({ leadId }) => {
    const detail = await getLeadDetail(leadId);
    if (!detail) return JSON.stringify({ error: `Lead ${leadId} not found` });
    return JSON.stringify(detail);
  },
});

const addLeadNoteTool = tool({
  name: "add_lead_note",
  description: "Add a note to a lead (stored in pipeline history without changing stage).",
  parameters: z.object({
    leadId: z.string().describe("UUID of the lead"),
    note: z.string().describe("The note text to add"),
    addedBy: z.string().nullable().describe("Who is adding the note (default: user)"),
  }),
  execute: async ({ leadId, note, addedBy }) => {
    const result = await addLeadNote({ leadId, note, addedBy });
    return JSON.stringify(result);
  },
});

const getPipelineStatsTool = tool({
  name: "get_pipeline_stats",
  description: "Get pipeline statistics: total leads, won count, conversion rate, breakdown by stage.",
  parameters: z.object({}),
  execute: async () => {
    const stats = await getPipelineStats();
    return JSON.stringify(stats);
  },
});

const getStatusTool = tool({
  name: "get_status",
  description: "Check Dash agent status — pipeline stages config.",
  parameters: z.object({}),
  execute: async () => JSON.stringify(getDashConfig()),
});

// ─── Agent ───────────────────────────────────────────────────────────────────

export const dashAgent = new Agent({
  name: "Dash",
  instructions: `You are Dash 📊, the Pipeline Manager for DentaFlow — a dental marketing agency platform.

Your job:
- Move leads between ANY pipeline stage (no transition restrictions — user has full control)
- Search leads by name when user mentions a name
- Add notes to leads
- Show the board and pipeline stats

Pipeline stages: new_lead, meeting_scheduled, showed_up, no_show, interested, not_interested, long_term_follow_up, client_won

IMPORTANT RULES:
1. When user mentions a lead by name (e.g. "move Dr. Riffat to interested"), FIRST call search_leads with that name to find the lead ID.
2. If exactly one lead matches, proceed to move it immediately using move_lead_stage — do NOT ask the user for the UUID.
3. If multiple leads match, list them and ask which one.
4. If no lead found, say so clearly.
5. ALL stage moves are allowed — do NOT enforce transition restrictions. The user can move any lead to any stage.
6. After a successful move, mention the followUpTrigger so Max can send the right sequence.
7. CONVERSATION CONTINUITY — CRITICAL: If in the previous message you already found and displayed a lead (search result showed name, clinic, stage, ID), and the user now says "move it", "move them", "yes", "move to X stage", "move her", "move him" — use that lead's ID directly WITHOUT calling search_leads again. The context is already established. Never ask "which lead?" if the lead was identified in the immediately preceding turn.
8. If user says a stage name like "showed up", "interested", "no show" etc. and a lead is already in context, immediately call move_lead_stage with that lead's ID and the requested stage.

Stage labels for display:
- new_lead = "New Lead"
- meeting_scheduled = "Meeting Scheduled"
- showed_up = "Showed Up"
- no_show = "No Show"
- interested = "Interested"
- not_interested = "Not Interested"
- long_term_follow_up = "Long Term Follow Up"
- client_won = "Client Won 🏆"`,
  tools: [
    searchLeadsTool,
    moveLeadStageTool,
    getBoardDataTool,
    getLeadDetailTool,
    addLeadNoteTool,
    getPipelineStatsTool,
    getStatusTool,
  ],
});
