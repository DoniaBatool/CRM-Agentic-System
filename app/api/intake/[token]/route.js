/**
 * /api/intake/[token]
 *
 * GET  → fetch lead by intake_token (for pre-populating the form)
 * POST → save form submission, move lead to 'interested', trigger interested_sequence
 */

import { getSupabase } from "@/lib/supabase.js";
import { scheduleSequence } from "@/lib/max-agent.js";

export async function GET(request, { params }) {
  const { token } = params;
  if (!token) return resp({ error: "Token required" }, 400);

  const sb = getSupabase();
  if (!sb) return resp({ error: "Service unavailable" }, 503);

  const { data: lead, error } = await sb
    .from("agency_leads")
    .select("id, name, clinic_name, email, phone, city, stage, intake_token, intake_submitted_at")
    .eq("intake_token", token)
    .single();

  if (error || !lead) return resp({ error: "Lead not found" }, 404);
  return resp({ lead });
}

export async function POST(request, { params }) {
  const { token } = params;
  if (!token) return resp({ error: "Token required" }, 400);

  const sb = getSupabase();
  if (!sb) return resp({ error: "Service unavailable" }, 503);

  // Load lead
  const { data: lead, error: fetchErr } = await sb
    .from("agency_leads")
    .select("id, name, clinic_name, email, phone, city, stage, intake_token, intake_submitted_at, booking_link")
    .eq("intake_token", token)
    .single();

  if (fetchErr || !lead) return resp({ error: "Lead not found" }, 404);

  // Idempotent — don't double-submit
  if (lead.intake_submitted_at) {
    return resp({ ok: true, alreadySubmitted: true });
  }

  const body = await request.json().catch(() => ({}));
  const intakeData = {
    name:         (body.name || "").trim(),
    clinic_name:  (body.clinic_name || "").trim(),
    treatments:   Array.isArray(body.treatments) ? body.treatments : [],
    contact_time: body.contact_time || "",
    questions:    body.questions || "",
  };

  // Update lead: save intake data, move to interested
  const { error: updateErr } = await sb
    .from("agency_leads")
    .update({
      name:                intakeData.name || lead.name,
      clinic_name:         intakeData.clinic_name || lead.clinic_name,
      treatments_offered:  intakeData.treatments,
      intake_data:         intakeData,
      intake_submitted_at: new Date().toISOString(),
      stage:               "interested",
      updated_at:          new Date().toISOString(),
    })
    .eq("id", lead.id);

  if (updateErr) {
    console.error("[intake] update error:", updateErr);
    return resp({ error: "Failed to save. Please try again." }, 500);
  }

  // Log to pipeline_history
  try {
    await sb.from("pipeline_history").insert([{
      lead_id:    lead.id,
      from_stage: lead.stage,
      to_stage:   "interested",
      note:       "Interest form submitted",
      changed_at: new Date().toISOString(),
    }]);
  } catch (_) {}

  // Schedule interested_sequence
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
    await scheduleSequence({
      sequenceKey: "interested_sequence",
      lead: {
        id:          lead.id,
        name:        intakeData.name || lead.name,
        email:       lead.email,
        phone:       lead.phone,
        clinicName:  intakeData.clinic_name || lead.clinic_name,
        city:        lead.city,
        bookingLink: lead.booking_link || `${baseUrl}/book`,
        intakeToken: token,
      },
    });
  } catch (seqErr) {
    // Don't fail the form submission if scheduling errors
    console.error("[intake] schedule interested_sequence error:", seqErr);
  }

  return resp({ ok: true });
}

function resp(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
