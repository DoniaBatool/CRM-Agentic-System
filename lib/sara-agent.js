/**
 * Sara — Workflow Tester Agent (pure functions)
 *
 * All business logic for Sara's webhook testing features.
 * No SDK imports here — keeps functions testable in isolation.
 */

import axios from "axios";
import { getSupabase } from "./supabase.js";

// ─── Sub-account management ───────────────────────────────────────────────────

/**
 * Seed sub-accounts from .env on first load.
 * Looks for pairs like: PIT_DENTAL_CLIENT + DENTAL_CLIENT_LOCATION_ID
 * Also seeds webhook URLs from GHL_WEBHOOK_* for the matching location.
 */
export async function seedSubAccountsFromEnv() {
  const sb = getSupabase();
  if (!sb) return;

  // Find all PIT_* env vars
  const pitEntries = Object.entries(process.env)
    .filter(([k]) => k.startsWith("PIT_"))
    .map(([k, v]) => {
      const suffix = k.replace(/^PIT_/, ""); // e.g. "DENTAL_CLIENT"
      const locationKey = `${suffix}_LOCATION_ID`;
      const locationId = process.env[locationKey];
      if (!locationId || !v) return null;
      // Convert suffix to display name: DENTAL_CLIENT → "Dental Client"
      const name = suffix.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
      return { name, locationId, pitToken: v };
    })
    .filter(Boolean);

  for (const acct of pitEntries) {
    // Upsert sub-account (skip if location_id already exists)
    const { data: existing } = await sb
      .from("sub_accounts")
      .select("id")
      .eq("location_id", acct.locationId)
      .single();

    let subAccountId = existing?.id;
    if (!subAccountId) {
      const { data: inserted } = await sb
        .from("sub_accounts")
        .insert({ name: acct.name, location_id: acct.locationId, pit_token: acct.pitToken })
        .select("id")
        .single();
      subAccountId = inserted?.id;
    }

    if (!subAccountId) continue;

    // Seed built-in webhook URLs from env (only if this location matches GHL_LOCATION_ID)
    if (acct.locationId === process.env.GHL_LOCATION_ID || acct.locationId === process.env.DENTAL_CLIENT_LOCATION_ID) {
      const builtIns = [
        { label: "Treatment Booked",                  type: "treatment",             action: "booked",       url: process.env.GHL_WEBHOOK_TREATMENT_BOOKED },
        { label: "Treatment Rescheduled",             type: "treatment",             action: "rescheduled",  url: process.env.GHL_WEBHOOK_TREATMENT_RESCHEDULED },
        { label: "Personal Consultation Booked",      type: "Personal Consultation", action: "booked",       url: process.env.GHL_WEBHOOK_PC_BOOKED },
        { label: "Personal Consultation Rescheduled", type: "Personal Consultation", action: "rescheduled",  url: process.env.GHL_WEBHOOK_PC_RESCHEDULED },
      ];
      for (const bi of builtIns) {
        const url = (!bi.url || bi.url === "PENDING") ? null : bi.url;
        await sb.from("sub_account_webhooks").upsert(
          { sub_account_id: subAccountId, event_label: bi.label, event_type: bi.type, action: bi.action, webhook_url: url },
          { onConflict: "sub_account_id,event_type,action", ignoreDuplicates: false }
        );
      }
    } else {
      // Other sub-accounts: seed the 4 built-in event rows with null URLs
      const builtIns = [
        { label: "Treatment Booked",                  type: "treatment",             action: "booked" },
        { label: "Treatment Rescheduled",             type: "treatment",             action: "rescheduled" },
        { label: "Personal Consultation Booked",      type: "Personal Consultation", action: "booked" },
        { label: "Personal Consultation Rescheduled", type: "Personal Consultation", action: "rescheduled" },
      ];
      for (const bi of builtIns) {
        await sb.from("sub_account_webhooks").upsert(
          { sub_account_id: subAccountId, event_label: bi.label, event_type: bi.type, action: bi.action, webhook_url: null },
          { onConflict: "sub_account_id,event_type,action", ignoreDuplicates: true }
        );
      }
    }
  }
}

export async function getSubAccounts() {
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from("sub_accounts")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Sara getSubAccounts error:", error.message);
    return [];
  }
  return data || [];
}

export async function addSubAccount({ name, locationId, pitToken }) {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not connected");
  if (!name || !locationId || !pitToken) throw new Error("name, locationId, and pitToken are required");

  const { data, error } = await sb
    .from("sub_accounts")
    .insert({ name, location_id: locationId, pit_token: pitToken })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  // Seed 4 built-in event rows with null URLs
  const builtIns = [
    { label: "Treatment Booked",                  type: "treatment",             action: "booked" },
    { label: "Treatment Rescheduled",             type: "treatment",             action: "rescheduled" },
    { label: "Personal Consultation Booked",      type: "Personal Consultation", action: "booked" },
    { label: "Personal Consultation Rescheduled", type: "Personal Consultation", action: "rescheduled" },
  ];
  for (const bi of builtIns) {
    await sb.from("sub_account_webhooks").insert({
      sub_account_id: data.id, event_label: bi.label, event_type: bi.type, action: bi.action, webhook_url: null,
    }).catch(() => {});
  }

  return data;
}

export async function getSubAccountWebhooks(subAccountId) {
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from("sub_account_webhooks")
    .select("*")
    .eq("sub_account_id", subAccountId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Sara getSubAccountWebhooks error:", error.message);
    return [];
  }
  return data || [];
}

export async function setSubAccountWebhook(subAccountId, eventType, action, webhookUrl) {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not connected");

  const { data, error } = await sb
    .from("sub_account_webhooks")
    .update({ webhook_url: webhookUrl || null })
    .eq("sub_account_id", subAccountId)
    .eq("event_type", eventType)
    .eq("action", action)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ─── Built-in webhook map (from env) ─────────────────────────────────────────

export function getBuiltInWebhookMap() {
  return {
    treatment: {
      booked: process.env.GHL_WEBHOOK_TREATMENT_BOOKED || null,
      rescheduled: process.env.GHL_WEBHOOK_TREATMENT_RESCHEDULED || null,
    },
    personal_consultation: {
      booked: process.env.GHL_WEBHOOK_PC_BOOKED || null,
      rescheduled: process.env.GHL_WEBHOOK_PC_RESCHEDULED || null,
    },
  };
}

export const BUILT_IN_EVENT_LABELS = [
  { label: "Treatment Booked",                   eventType: "treatment",            action: "booked" },
  { label: "Treatment Rescheduled",              eventType: "treatment",            action: "rescheduled" },
  { label: "Personal Consultation Booked",       eventType: "Personal Consultation", action: "booked" },
  { label: "Personal Consultation Rescheduled",  eventType: "Personal Consultation", action: "rescheduled" },
];

// ─── Default datetime helper ──────────────────────────────────────────────────

export function getDefaultDateTime() {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  now.setHours(10, 0, 0, 0);
  // Return as local datetime string (YYYY-MM-DDTHH:MM)
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

// ─── Webhook URL resolver ─────────────────────────────────────────────────────

export function resolveWebhookUrl(eventType, action, customUrl = null) {
  if (customUrl && customUrl.trim()) return customUrl.trim();

  const map = getBuiltInWebhookMap();
  const key = eventType === "treatment" ? "treatment" : "personal_consultation";
  return map[key]?.[action] || null;
}

// ─── Fire a single webhook ────────────────────────────────────────────────────

export async function fireWebhook({ webhookUrl, payload }) {
  if (!webhookUrl) throw new Error("webhookUrl is required");
  if (!payload || typeof payload !== "object") throw new Error("payload is required");

  try {
    const res = await axios.post(webhookUrl, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    });
    return {
      status_code: res.status,
      status_text: res.statusText,
      response_body: typeof res.data === "string" ? res.data : JSON.stringify(res.data),
      success: true,
    };
  } catch (err) {
    const res = err.response;
    return {
      status_code: res?.status || null,
      status_text: res?.statusText || err.message,
      response_body: res?.data ? JSON.stringify(res.data) : err.message,
      success: false,
    };
  }
}

// ─── Save webhook history to Supabase ────────────────────────────────────────

export async function saveWebhookHistory(entry) {
  const sb = getSupabase();
  if (!sb) return { id: null, saved: false };

  const row = {
    contact_name:  entry.contactName  || null,
    contact_email: entry.contactEmail || null,
    contact_phone: entry.contactPhone || null,
    event_type:    entry.eventType    || null,
    action:        entry.action       || null,
    webhook_url:   entry.webhookUrl   || null,
    payload:       entry.payload      || null,
    status_code:   entry.statusCode   ?? null,
    status_text:   entry.statusText   || null,
    response_body: entry.responseBody || null,
    success:       entry.success      ?? false,
    notes:         entry.notes        || null,
  };

  const { data, error } = await sb.from("webhook_history").insert(row).select("id").single();
  if (error) {
    console.error("Sara saveWebhookHistory error:", error.message);
    return { id: null, saved: false };
  }
  return { id: data.id, saved: true };
}

// ─── Get webhook history ──────────────────────────────────────────────────────

export async function getWebhookHistory({ limit = 50, onlyFailed = false } = {}) {
  const sb = getSupabase();
  if (!sb) return [];

  let query = sb
    .from("webhook_history")
    .select("*")
    .order("fired_at", { ascending: false })
    .limit(limit);

  if (onlyFailed) query = query.eq("success", false);

  const { data, error } = await query;
  if (error) {
    console.error("Sara getWebhookHistory error:", error.message);
    return [];
  }
  return data || [];
}

// ─── Retry a webhook from history ────────────────────────────────────────────

export async function retryWebhook(historyId) {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not connected");

  const { data: row, error } = await sb
    .from("webhook_history")
    .select("*")
    .eq("id", historyId)
    .single();

  if (error || !row) throw new Error("History entry not found");

  const result = await fireWebhook({ webhookUrl: row.webhook_url, payload: row.payload });

  await saveWebhookHistory({
    contactName:  row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    eventType:    row.event_type,
    action:       row.action,
    webhookUrl:   row.webhook_url,
    payload:      row.payload,
    statusCode:   result.status_code,
    statusText:   result.status_text,
    responseBody: result.response_body,
    success:      result.success,
    notes:        `Retry of ${historyId}`,
  });

  return result;
}

// ─── Bulk fire webhook for multiple contacts ──────────────────────────────────

export async function bulkFireWebhooks({ contacts, eventType, action, webhookUrl, customUrl }) {
  const url = customUrl || webhookUrl;
  if (!url) throw new Error("webhookUrl is required");

  const results = await Promise.all(
    contacts.map(async (contact) => {
      const payload = {
        event:                eventType,
        action:               action,
        email:                contact.email || "",
        contact_number:       contact.phone || "",
        first_name:           contact.firstName || contact.name?.split(" ")[0] || "",
        last_name:            contact.lastName  || contact.name?.split(" ").slice(1).join(" ") || "",
        appointment_datetime: getDefaultDateTime(),
        secret:               "abc123",
      };

      const result = await fireWebhook({ webhookUrl: url, payload });

      await saveWebhookHistory({
        contactName:  contact.name || `${payload.first_name} ${payload.last_name}`.trim(),
        contactEmail: contact.email,
        contactPhone: contact.phone,
        eventType,
        action,
        webhookUrl:   url,
        payload,
        statusCode:   result.status_code,
        statusText:   result.status_text,
        responseBody: result.response_body,
        success:      result.success,
        notes:        "bulk fire",
      });

      return { contact: payload.first_name + " " + payload.last_name, ...result };
    })
  );

  return results;
}

// ─── Health check all configured webhooks ────────────────────────────────────

export async function healthCheckWebhooks(customEvents = []) {
  const map = getBuiltInWebhookMap();

  const checks = [
    { label: "Treatment Booked",                  url: map.treatment.booked },
    { label: "Treatment Rescheduled",             url: map.treatment.rescheduled },
    { label: "Personal Consultation Booked",      url: map.personal_consultation.booked },
    { label: "Personal Consultation Rescheduled", url: map.personal_consultation.rescheduled },
    ...customEvents.map((e) => ({ label: e.event_label, url: e.webhook_url })),
  ];

  const results = await Promise.all(
    checks.map(async ({ label, url }) => {
      if (!url || url === "PENDING") {
        return { label, url, status: "pending", message: "Not configured" };
      }
      try {
        const res = await axios.post(url, { health_check: true }, {
          headers: { "Content-Type": "application/json" },
          timeout: 8000,
          validateStatus: () => true, // don't throw on any HTTP status
        });
        return {
          label,
          url,
          status: res.status < 500 ? "live" : "error",
          statusCode: res.status,
          message: `${res.status} ${res.statusText}`,
        };
      } catch (err) {
        return { label, url, status: "dead", message: err.message };
      }
    })
  );

  return results;
}

// ─── Custom events (Supabase) ─────────────────────────────────────────────────

export async function getCustomEvents() {
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from("sara_custom_events")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Sara getCustomEvents error:", error.message);
    return [];
  }
  return data || [];
}

export async function saveCustomEvent({ eventLabel, eventType, action, webhookUrl, payloadTemplate }) {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not connected");
  if (!eventLabel || !eventType || !action) throw new Error("eventLabel, eventType, and action are required");

  const { data, error } = await sb
    .from("sara_custom_events")
    .insert({
      event_label:      eventLabel,
      event_type:       eventType,
      action,
      webhook_url:      webhookUrl || null,
      payload_template: payloadTemplate || null,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteCustomEvent(id) {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not connected");

  const { error } = await sb.from("sara_custom_events").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { deleted: true };
}

// ─── Payload templates (Supabase) ─────────────────────────────────────────────

export async function getPayloadTemplates() {
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from("sara_payload_templates")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Sara getPayloadTemplates error:", error.message);
    return [];
  }
  return data || [];
}

export async function savePayloadTemplate({ name, eventType, action, payload }) {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not connected");
  if (!name || !payload) throw new Error("name and payload are required");

  const { data, error } = await sb
    .from("sara_payload_templates")
    .insert({ name, event_type: eventType || null, action: action || null, payload })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deletePayloadTemplate(id) {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not connected");

  const { error } = await sb.from("sara_payload_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { deleted: true };
}
