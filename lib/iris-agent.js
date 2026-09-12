/**
 * Iris — Lead Intake Gateway
 *
 * Activates when:
 *   1. A dental practice owner submits a survey/contact form
 *   2. A virtual meeting is booked via Google Calendar
 *
 * Responsibilities:
 *   - Validate and normalize incoming lead data
 *   - Create/upsert lead record in Supabase (agency_leads table)
 *   - Set initial pipeline stage ("new_lead" or "meeting_scheduled")
 *   - Emit structured lead object for Dash (pipeline) and Max (follow-up)
 *
 * Does NOT:
 *   - Send messages (that is Max's job)
 *   - Move pipeline stages after intake (that is Dash's job)
 *   - Book meetings (that is Cal's job)
 */

import { getSupabase } from "./supabase.js";

// ─── Constants ──────────────────────────────────────────────────────────────

export const PIPELINE_STAGES = {
  NEW_LEAD: "new_lead",
  MEETING_SCHEDULED: "meeting_scheduled",
  SHOWED_UP: "showed_up",
  NO_SHOW: "no_show",
  INTERESTED: "interested",
  NOT_INTERESTED: "not_interested",
  LONG_TERM_FOLLOW_UP: "long_term_follow_up",
  CLIENT_WON: "client_won",
};

export const INTAKE_SOURCES = {
  SURVEY: "survey",
  CALENDAR_BOOKING: "calendar_booking",
  MANUAL: "manual",
};

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Normalize and validate raw lead data from a form submission or calendar webhook.
 * Returns { valid: true, lead } or { valid: false, errors: [...] }
 */
export function normalizeLead(raw = {}) {
  const errors = [];

  const lead = {
    // Identity
    name: (raw.name || raw.full_name || raw.contact_name || "").trim(),
    email: (raw.email || raw.contact_email || "").trim().toLowerCase(),
    phone: normalizePhone(raw.phone || raw.contact_phone || raw.contact_number || ""),
    organization_name: (raw.organization_name || raw.organization || raw.clinic_name || raw.business_name || raw.practice_name || "").trim(),
    city: (raw.city || raw.location || "").trim(),

    // Intent signals
    source: raw.source || INTAKE_SOURCES.SURVEY,
    interest_level: raw.interest_level || raw.budget || null,
    treatments_offered: Array.isArray(raw.treatments)
      ? raw.treatments
      : raw.treatments_offered
        ? [raw.treatments_offered]
        : [],
    message: (raw.message || raw.notes || raw.comment || "").trim(),

    // Meeting info (calendar_booking source)
    meeting_datetime: raw.meeting_datetime || raw.event_start || null,
    calendar_event_id: raw.calendar_event_id || raw.event_id || null,

    // Metadata
    created_at: new Date().toISOString(),
    stage: raw.source === INTAKE_SOURCES.CALENDAR_BOOKING
      ? PIPELINE_STAGES.MEETING_SCHEDULED
      : PIPELINE_STAGES.NEW_LEAD,
  };

  // Required field validation
  if (!lead.name) errors.push("name is required");
  if (!lead.email && !lead.phone) errors.push("at least email or phone is required");

  // Email format check
  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
    errors.push(`invalid email format: ${lead.email}`);
  }

  // Meeting validation for calendar bookings
  if (
    lead.source === INTAKE_SOURCES.CALENDAR_BOOKING &&
    !lead.meeting_datetime
  ) {
    errors.push("meeting_datetime is required for calendar_booking source");
  }

  return errors.length > 0
    ? { valid: false, errors }
    : { valid: true, lead };
}

function normalizePhone(raw = "") {
  const cleaned = raw.replace(/[\s\-().]/g, "");
  return cleaned || null;
}

// ─── Duplicate Detection ────────────────────────────────────────────────────

/**
 * Check if a lead with same email or phone already exists in the pipeline.
 * Returns existing lead or null.
 */
export async function findExistingLead({ email, phone }) {
  const sb = getSupabase();
  if (!sb) return null;

  if (email) {
    const { data } = await sb
      .from("agency_leads")
      .select("*")
      .eq("email", email)
      .limit(1);
    if (data?.length) return data[0];
  }

  if (phone) {
    const { data } = await sb
      .from("agency_leads")
      .select("*")
      .eq("phone", phone)
      .limit(1);
    if (data?.length) return data[0];
  }

  return null;
}

// ─── Core: Save Lead ────────────────────────────────────────────────────────

/**
 * Save a validated lead to Supabase agency_leads table.
 * If lead already exists (same email/phone), update stage if it's a calendar booking.
 * Returns { success, leadId, isNew, lead }
 */
export async function saveLead(lead) {
  const sb = getSupabase();

  // Fallback: in-memory store when Supabase is not configured (dev/test)
  if (!sb) {
    const fallback = { ...lead, id: `local-${Date.now()}` };
    return { success: true, leadId: fallback.id, isNew: true, lead: fallback };
  }

  // Duplicate check
  const existing = await findExistingLead({ email: lead.email, phone: lead.phone });

  if (existing) {
    // If this is a calendar booking for an existing lead → upgrade stage
    if (lead.source === INTAKE_SOURCES.CALENDAR_BOOKING) {
      const { data, error } = await sb
        .from("agency_leads")
        .update({
          stage: PIPELINE_STAGES.MEETING_SCHEDULED,
          meeting_datetime: lead.meeting_datetime,
          calendar_event_id: lead.calendar_event_id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw new Error(`Supabase update error: ${error.message}`);
      return { success: true, leadId: existing.id, isNew: false, lead: data };
    }

    // Duplicate survey — return existing without overwriting
    return { success: true, leadId: existing.id, isNew: false, lead: existing };
  }

  // New lead — insert
  const { data, error } = await sb
    .from("agency_leads")
    .insert([{ ...lead, updated_at: new Date().toISOString() }])
    .select()
    .single();

  if (error) throw new Error(`Supabase insert error: ${error.message}`);
  return { success: true, leadId: data.id, isNew: true, lead: data };
}

// ─── Core: Process Intake ────────────────────────────────────────────────────

/**
 * Main entry point for Iris.
 * Accepts raw webhook/form payload, validates, saves, returns structured result.
 *
 * Returns:
 * {
 *   success: boolean,
 *   leadId: string,
 *   isNew: boolean,
 *   stage: string,
 *   lead: object,
 *   errors?: string[]     ← present only when validation fails
 * }
 */
export async function processIntake(rawPayload = {}) {
  // Step 1: Normalize + validate
  const { valid, errors, lead } = normalizeLead(rawPayload);
  if (!valid) {
    return { success: false, errors };
  }

  // Step 2: Save to Supabase
  const result = await saveLead(lead);

  return {
    success: true,
    leadId: result.leadId,
    isNew: result.isNew,
    stage: result.lead.stage,
    lead: result.lead,
  };
}

// ─── Handler (used by agent-handlers.js) ───────────────────────────────────

/**
 * Get summary of recent leads — used by the chat interface.
 */
export async function getRecentLeads({ limit = 20 } = {}) {
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from("agency_leads")
    .select("id, name, organization_name, email, phone, stage, source, created_at, meeting_datetime")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Supabase fetch error: ${error.message}`);
  return data || [];
}

/**
 * Get pipeline counts per stage — used by Dash.
 */
export async function getPipelineCounts() {
  const sb = getSupabase();
  if (!sb) {
    // Return zeroed counts in dev
    return Object.values(PIPELINE_STAGES).reduce((acc, s) => ({ ...acc, [s]: 0 }), {});
  }

  const { data, error } = await sb
    .from("agency_leads")
    .select("stage");

  if (error) throw new Error(`Supabase fetch error: ${error.message}`);

  const counts = Object.values(PIPELINE_STAGES).reduce(
    (acc, s) => ({ ...acc, [s]: 0 }),
    {}
  );
  for (const row of data || []) {
    if (counts[row.stage] !== undefined) counts[row.stage]++;
  }
  return counts;
}

/**
 * Get Iris config/status — for agent intro
 */
export function getIrisConfig() {
  return {
    stages: Object.values(PIPELINE_STAGES),
    sources: Object.values(INTAKE_SOURCES),
    supabaseConnected: Boolean(getSupabase()),
  };
}
