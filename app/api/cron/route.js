/**
 * /api/cron
 *
 * Vercel Cron endpoint — runs every 30 minutes.
 * Picks up pending outreach_schedule rows where send_at <= NOW(),
 * sends them via Brevo SMTP or Twilio, marks sent/failed.
 *
 * Secured with CRON_SECRET env var. Vercel passes it automatically
 * when invoked by cron; set it manually for manual triggers.
 */

import { getSupabase } from "@/lib/supabase.js";
import { sendEmail, sendWhatsApp } from "@/lib/max-agent.js";

const BATCH_SIZE = 20; // max rows per cron run

export async function GET(request) {
  // Auth check
  const auth   = request.headers.get("authorization") || "";
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return resp({ error: "Unauthorized" }, 401);
  }

  const sb = getSupabase();
  if (!sb) return resp({ error: "Supabase not configured" }, 503);

  const now = new Date().toISOString();

  // Fetch pending rows due to send
  const { data: rows, error: fetchErr } = await sb
    .from("outreach_schedule")
    .select("*")
    .eq("status", "pending")
    .lte("send_at", now)
    .order("send_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchErr) {
    console.error("[cron] fetch error:", fetchErr);
    return resp({ error: fetchErr.message }, 500);
  }

  if (!rows?.length) {
    return resp({ ok: true, processed: 0, message: "No pending rows" });
  }

  const results = await Promise.allSettled(rows.map((row) => processRow(sb, row)));

  const sent   = results.filter((r) => r.status === "fulfilled" && r.value?.sent).length;
  const failed = results.filter((r) => r.status === "rejected" || r.value?.failed).length;

  console.log(`[cron] processed ${rows.length} rows — ${sent} sent, ${failed} failed`);

  return resp({ ok: true, processed: rows.length, sent, failed });
}

async function processRow(sb, row) {
  try {
    if (row.channel === "email") {
      if (!row.to_email) throw new Error("No to_email");
      const emailResult = await sendEmail({
        to:      row.to_email,
        subject: row.subject || "(no subject)",
        html:    row.html || undefined,
        text:    row.text_body || undefined,
      });
      // dev mode — SMTP not configured, don't mark as sent
      if (emailResult?.dev) throw new Error("SMTP not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS in Vercel env vars");
    } else if (row.channel === "whatsapp") {
      if (!row.to_phone) throw new Error("No to_phone");
      await sendWhatsApp({ to: row.to_phone, message: row.text_body || "" });
    } else {
      throw new Error(`Unknown channel: ${row.channel}`);
    }

    // Mark sent
    await sb.from("outreach_schedule").update({
      status:  "sent",
      sent_at: new Date().toISOString(),
      error:   null,
    }).eq("id", row.id);

    return { sent: true, id: row.id };
  } catch (err) {
    console.error(`[cron] row ${row.id} failed:`, err.message);

    // Mark failed
    try {
      await sb.from("outreach_schedule").update({
        status: "failed",
        error:  err.message,
      }).eq("id", row.id);
    } catch (_) {}

    return { failed: true, id: row.id, error: err.message };
  }
}

function resp(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
