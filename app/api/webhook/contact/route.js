/**
 * /api/webhook/contact
 *
 * Called by the NovaFlow AI website contact form on submit.
 * Creates a lead via Iris, then schedules Max's new_lead_sequence.
 *
 * POST body: { name, email, subject, message }
 * Returns:   { ok: true } or { error: "..." }
 *
 * Security: WEBHOOK_SECRET env var (optional but recommended).
 * Add header: X-Webhook-Secret: <your-secret> from the website side.
 */

import { processIntake } from "@/lib/iris-agent.js";
import { scheduleSequence, generateIntakeToken } from "@/lib/max-agent.js";
import { getSupabase } from "@/lib/supabase.js";

export async function POST(request) {
  // Optional secret check
  const secret = process.env.WEBHOOK_SECRET;
  if (secret) {
    const incoming = request.headers.get("x-webhook-secret") || "";
    if (incoming !== secret) {
      return resp({ error: "Unauthorized" }, 401);
    }
  }

  // CORS — allow your Vercel website
  const origin = request.headers.get("origin") || "";
  const allowed = [
    "https://novaflow-ai-rho.vercel.app",
    "https://novaflow-ai.vercel.app",
    "http://localhost:3000",
    "http://localhost:3001",
  ];

  const body = await request.json().catch(() => ({}));
  const { name, email, organization, phone, city, subject, message } = body;

  if (!name?.trim() || !email?.trim()) {
    return corsResp({ error: "name and email are required" }, 400, origin);
  }

  // 1. Create lead via Iris
  const intake = await processIntake({
    name:              name.trim(),
    email:             email.trim().toLowerCase(),
    phone:             phone || null,
    organization_name: organization?.trim() || "",
    city:              city?.trim() || "",
    source:            "website_contact",
    message:           [subject, message].filter(Boolean).join(" | "),
  });

  if (!intake.success) {
    // Lead already exists — not an error, just return ok
    if (intake.errors?.includes("duplicate")) {
      return corsResp({ ok: true, status: "duplicate" }, 200, origin);
    }
    console.error("[webhook/contact] Iris intake failed:", intake.errors);
    return corsResp({ error: "Could not save lead." }, 500, origin);
  }

  // 2. If new lead with email → generate intake token + schedule welcome sequence
  if (intake.isNew && intake.lead?.id) {
    const sb = getSupabase();
    const intakeToken = generateIntakeToken();

    if (sb) {
      await sb
        .from("agency_leads")
        .update({ intake_token: intakeToken })
        .eq("id", intake.lead.id);
    }

    // Must await — Vercel kills the function after the response is sent (learning #67)
    try {
      await scheduleSequence({
        sequenceKey: "new_lead_sequence",
        lead: {
          id:          intake.lead.id,
          name:        intake.lead.name,
          email:       intake.lead.email,
          phone:       intake.lead.phone || "",
          clinicName:  intake.lead.organization_name || intake.lead.name,
          city:        intake.lead.city || "",
          intakeToken: intakeToken,
        },
      });
    } catch (err) {
      console.error("[webhook/contact] Max schedule failed:", err.message);
    }
  }

  return corsResp({ ok: true, status: intake.isNew ? "created" : "exists" }, 200, origin);
}

// Handle preflight CORS
export async function OPTIONS(request) {
  const origin = request.headers.get("origin") || "";
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

function corsHeaders(origin) {
  const allowed = [
    "https://novaflow-ai-rho.vercel.app",
    "https://novaflow-ai.vercel.app",
  ];
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin":  allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Webhook-Secret",
  };
}

function corsResp(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function resp(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
