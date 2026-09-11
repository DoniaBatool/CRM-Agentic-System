/**
 * Dash — Pipeline Manager
 *
 * Manages all Kanban pipeline operations in Supabase.
 * Powers the drag-and-drop board in the frontend.
 *
 * Responsibilities:
 *   - Move leads between pipeline stages
 *   - Add notes to leads
 *   - Fetch board data (all leads grouped by stage)
 *   - Track stage history (when did a lead move and why)
 *   - Signal Max when a stage change requires a follow-up sequence
 *
 * Does NOT:
 *   - Send messages directly (Max's job)
 *   - Create leads (Iris's job)
 *   - Book meetings (Cal's job)
 */

import { getSupabase } from "./supabase.js";
import { PIPELINE_STAGES } from "./iris-agent.js";

// ─── Stage Config ────────────────────────────────────────────────────────────

export const STAGE_META = {
  [PIPELINE_STAGES.NEW_LEAD]: {
    label: "New Lead",
    color: "#6366f1",
    order: 0,
    triggerFollowUp: "new_lead_sequence",
  },
  [PIPELINE_STAGES.MEETING_SCHEDULED]: {
    label: "Meeting Scheduled",
    color: "#f59e0b",
    order: 1,
    triggerFollowUp: "pre_meeting_reminder",
  },
  [PIPELINE_STAGES.SHOWED_UP]: {
    label: "Showed Up",
    color: "#3b82f6",
    order: 2,
    triggerFollowUp: "post_meeting_follow_up",
  },
  [PIPELINE_STAGES.NO_SHOW]: {
    label: "No Show",
    color: "#ef4444",
    order: 3,
    triggerFollowUp: "no_show_reschedule",
  },
  [PIPELINE_STAGES.INTERESTED]: {
    label: "Interested",
    color: "#10b981",
    order: 4,
    triggerFollowUp: "interested_close_sequence",
  },
  [PIPELINE_STAGES.NOT_INTERESTED]: {
    label: "Not Interested",
    color: "#6b7280",
    order: 5,
    triggerFollowUp: null,
  },
  [PIPELINE_STAGES.LONG_TERM_FOLLOW_UP]: {
    label: "Long Term Follow Up",
    color: "#8b5cf6",
    order: 6,
    triggerFollowUp: "long_term_nurture",
  },
  [PIPELINE_STAGES.CLIENT_WON]: {
    label: "Client Won 🏆",
    color: "#059669",
    order: 7,
    triggerFollowUp: "onboarding_handoff",
  },
};

// Valid stage transitions (from → allowed tos)
const VALID_TRANSITIONS = {
  [PIPELINE_STAGES.NEW_LEAD]: [
    PIPELINE_STAGES.MEETING_SCHEDULED,
    PIPELINE_STAGES.NOT_INTERESTED,
    PIPELINE_STAGES.LONG_TERM_FOLLOW_UP,
  ],
  [PIPELINE_STAGES.MEETING_SCHEDULED]: [
    PIPELINE_STAGES.SHOWED_UP,
    PIPELINE_STAGES.NO_SHOW,
  ],
  [PIPELINE_STAGES.SHOWED_UP]: [
    PIPELINE_STAGES.INTERESTED,
    PIPELINE_STAGES.NOT_INTERESTED,
  ],
  [PIPELINE_STAGES.NO_SHOW]: [
    PIPELINE_STAGES.MEETING_SCHEDULED,
    PIPELINE_STAGES.LONG_TERM_FOLLOW_UP,
    PIPELINE_STAGES.NOT_INTERESTED,
  ],
  [PIPELINE_STAGES.INTERESTED]: [
    PIPELINE_STAGES.CLIENT_WON,
    PIPELINE_STAGES.LONG_TERM_FOLLOW_UP,
    PIPELINE_STAGES.NOT_INTERESTED,
  ],
  [PIPELINE_STAGES.NOT_INTERESTED]: [
    PIPELINE_STAGES.LONG_TERM_FOLLOW_UP,
  ],
  [PIPELINE_STAGES.LONG_TERM_FOLLOW_UP]: [
    PIPELINE_STAGES.MEETING_SCHEDULED,
    PIPELINE_STAGES.CLIENT_WON,
    PIPELINE_STAGES.NOT_INTERESTED,
  ],
  [PIPELINE_STAGES.CLIENT_WON]: [], // terminal
};

// ─── Validation ──────────────────────────────────────────────────────────────

export function isValidStage(stage) {
  return Object.values(PIPELINE_STAGES).includes(stage);
}

export function isValidTransition(fromStage, toStage) {
  if (!isValidStage(fromStage) || !isValidStage(toStage)) return false;
  if (fromStage === toStage) return false;
  const allowed = VALID_TRANSITIONS[fromStage] || [];
  return allowed.includes(toStage);
}

// ─── Move Stage ──────────────────────────────────────────────────────────────

/**
 * Move a lead to a new pipeline stage.
 * Validates the transition, updates Supabase, logs history.
 *
 * Returns: { success, lead, followUpTrigger }
 */
export async function moveLeadStage({ leadId, toStage, note = "", movedBy = "system" }) {
  if (!leadId) throw new Error("leadId is required");
  if (!isValidStage(toStage)) throw new Error(`Invalid stage: ${toStage}`);

  const sb = getSupabase();
  if (!sb) {
    // Dev fallback — simulate success
    return {
      success: true,
      lead: { id: leadId, stage: toStage },
      followUpTrigger: STAGE_META[toStage]?.triggerFollowUp || null,
    };
  }

  // Fetch current lead
  const { data: current, error: fetchErr } = await sb
    .from("agency_leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (fetchErr || !current) throw new Error(`Lead not found: ${leadId}`);

  const fromStage = current.stage;

  // Validate transition
  if (!isValidTransition(fromStage, toStage)) {
    throw new Error(
      `Invalid transition: ${fromStage} → ${toStage}. Allowed: ${(VALID_TRANSITIONS[fromStage] || []).join(", ") || "none"}`
    );
  }

  // Update lead stage
  const { data: updated, error: updateErr } = await sb
    .from("agency_leads")
    .update({
      stage: toStage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .select()
    .single();

  if (updateErr) throw new Error(`Stage update failed: ${updateErr.message}`);

  // Log stage history
  await sb.from("pipeline_history").insert([{
    lead_id: leadId,
    from_stage: fromStage,
    to_stage: toStage,
    note: note || null,
    moved_by: movedBy,
    moved_at: new Date().toISOString(),
  }]);

  const followUpTrigger = STAGE_META[toStage]?.triggerFollowUp || null;

  return { success: true, lead: updated, followUpTrigger };
}

// ─── Force Move (UI — bypasses VALID_TRANSITIONS) ────────────────────────────

/**
 * Move a lead to ANY stage — used by the UI where user has full control.
 * Does NOT validate transitions. Logs history.
 */
export async function forceMoveLeadStage({ leadId, toStage, note = "" }) {
  if (!leadId) throw new Error("leadId is required");
  if (!isValidStage(toStage)) throw new Error(`Invalid stage: ${toStage}`);

  const sb = getSupabase();
  if (!sb) return { success: true, lead: { id: leadId, stage: toStage } };

  const { data: current } = await sb.from("agency_leads").select("stage").eq("id", leadId).single();
  const fromStage = current?.stage || null;

  const { data: updated, error } = await sb
    .from("agency_leads")
    .update({ stage: toStage, updated_at: new Date().toISOString() })
    .eq("id", leadId)
    .select()
    .single();

  if (error) throw new Error(`Stage update failed: ${error.message}`);

  try {
    await sb.from("pipeline_history").insert([{
      lead_id: leadId, from_stage: fromStage, to_stage: toStage,
      note: note || null, moved_by: "user", moved_at: new Date().toISOString(),
    }]);
  } catch (_) {};

  return { success: true, lead: updated, followUpTrigger: STAGE_META[toStage]?.triggerFollowUp || null };
}

// ─── Search Leads by Name ────────────────────────────────────────────────────

/**
 * Search leads by name (case-insensitive partial match).
 * Returns array of matching leads with id, name, clinic_name, stage.
 */
export async function searchLeadsByName(name) {
  if (!name?.trim()) return [];
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("agency_leads")
    .select("id, name, clinic_name, stage, email, phone, city")
    .ilike("name", `%${name.trim()}%`)
    .order("updated_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(`Search error: ${error.message}`);
  return data || [];
}

// ─── Board Data ──────────────────────────────────────────────────────────────

/**
 * Fetch all leads grouped by stage for the Kanban board.
 * Returns: { stages: { [stageName]: Lead[] }, totalCount }
 */
export async function getBoardData() {
  const sb = getSupabase();

  if (!sb) {
    // Dev fallback — empty board
    const empty = Object.values(PIPELINE_STAGES).reduce(
      (acc, s) => ({ ...acc, [s]: [] }),
      {}
    );
    return { stages: empty, totalCount: 0 };
  }

  const { data, error } = await sb
    .from("agency_leads")
    .select("id, name, clinic_name, email, phone, stage, source, created_at, meeting_datetime, updated_at")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Board fetch error: ${error.message}`);

  const stages = Object.values(PIPELINE_STAGES).reduce(
    (acc, s) => ({ ...acc, [s]: [] }),
    {}
  );

  for (const lead of data || []) {
    if (stages[lead.stage]) {
      stages[lead.stage].push(lead);
    }
  }

  return { stages, totalCount: (data || []).length };
}

// ─── Lead Detail ─────────────────────────────────────────────────────────────

/**
 * Get full detail for a single lead including stage history.
 */
export async function getLeadDetail(leadId) {
  if (!leadId) throw new Error("leadId is required");

  const sb = getSupabase();
  if (!sb) return null;

  const [leadResult, historyResult] = await Promise.all([
    sb.from("agency_leads").select("*").eq("id", leadId).single(),
    sb.from("pipeline_history").select("*").eq("lead_id", leadId).order("moved_at", { ascending: true }),
  ]);

  if (leadResult.error) throw new Error(`Lead fetch error: ${leadResult.error.message}`);

  return {
    lead: leadResult.data,
    history: historyResult.data || [],
  };
}

// ─── Add Note ────────────────────────────────────────────────────────────────

/**
 * Add a note to a lead (stored in pipeline_history with from=to stage).
 */
export async function addLeadNote({ leadId, note, addedBy = "user" }) {
  if (!leadId) throw new Error("leadId is required");
  if (!note?.trim()) throw new Error("note cannot be empty");

  const sb = getSupabase();
  if (!sb) return { success: true };

  const { data: lead } = await sb
    .from("agency_leads")
    .select("stage")
    .eq("id", leadId)
    .single();

  await sb.from("pipeline_history").insert([{
    lead_id: leadId,
    from_stage: lead?.stage || null,
    to_stage: lead?.stage || null,
    note: note.trim(),
    moved_by: addedBy,
    moved_at: new Date().toISOString(),
  }]);

  return { success: true };
}

// ─── Stats ───────────────────────────────────────────────────────────────────

/**
 * Get pipeline statistics for the dashboard.
 */
export async function getPipelineStats() {
  const sb = getSupabase();

  if (!sb) {
    return {
      totalLeads: 0,
      wonCount: 0,
      byStage: {},
      conversionRate: 0,
      avgDaysToClose: null,
    };
  }

  const { data } = await sb.from("agency_leads").select("stage, created_at");
  const leads = data || [];

  const byStage = Object.values(PIPELINE_STAGES).reduce(
    (acc, s) => ({ ...acc, [s]: 0 }),
    {}
  );
  for (const l of leads) {
    if (byStage[l.stage] !== undefined) byStage[l.stage]++;
  }

  const won = byStage[PIPELINE_STAGES.CLIENT_WON] || 0;
  const total = leads.length;
  const conversionRate = total > 0 ? Math.round((won / total) * 100) : 0;

  return {
    totalLeads: total,
    byStage,
    conversionRate,
    wonCount: won,
  };
}

// ─── Dash Config ─────────────────────────────────────────────────────────────

export function getDashConfig() {
  return {
    stages: Object.entries(STAGE_META).map(([id, meta]) => ({
      id,
      ...meta,
    })),
    validTransitions: VALID_TRANSITIONS,
  };
}
