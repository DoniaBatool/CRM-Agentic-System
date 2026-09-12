/**
 * Max — Outreach Agent
 *
 * Handles email (Brevo SMTP) and WhatsApp (Twilio) follow-up sequences.
 * All scheduled emails are stored in outreach_schedule Supabase table.
 * A Vercel cron job (/api/cron) picks them up every 30 min and sends them.
 *
 * Does NOT:
 *   - Create leads (Iris's job)
 *   - Move pipeline stages (Dash's job)
 *   - Generate content (Nora's job)
 */

import crypto from "crypto";
import { getSupabase } from "./supabase.js";

// ─── Config helpers ───────────────────────────────────────────────────────────

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return { host, user, pass, port: parseInt(process.env.SMTP_PORT || "587", 10) };
}

function getTwilioConfig() {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_WHATSAPP_NUMBER;
  if (!sid || !token || !from) return null;
  return { sid, token, from };
}

export function getMaxConfig() {
  return {
    emailConnected:    Boolean(getSmtpConfig()),
    whatsappConnected: Boolean(getTwilioConfig()),
    sequences: Object.keys(SEQUENCES),
  };
}

// ─── Generate intake token ────────────────────────────────────────────────────

export function generateIntakeToken() {
  return crypto.randomBytes(24).toString("hex");
}

function intakeFormUrl(token) {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  return `${base}/intake/${token}`;
}

// ─── Sequence definitions ─────────────────────────────────────────────────────
// Each step: { channel, delayMs, subject, html, text }
// delayMs: milliseconds from sequence start (0 = send immediately)

const HOUR  = 60 * 60 * 1000;
const DAY   = 24 * HOUR;

export const SEQUENCES = {

  // ── 1. New Lead — welcome + follow-ups until form filled ──────────────────
  new_lead_sequence: {
    name: "New Lead Sequence",
    steps: [
      {
        channel: "email",
        delayMs: 0,
        subject: (lead) => `Growing ${lead.clinicName || lead.name}'s patient base — NovaFlow AI`,
        html: (lead, token) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;color:#1e293b;">
<p>Hi ${lead.name || "there"},</p>
<p>I came across <strong>${lead.clinicName || lead.name}</strong>${lead.city ? ` in ${lead.city}` : ""} and wanted to reach out.</p>
<p>I'm Donia from <strong>NovaFlow AI</strong> — we build AI-powered patient acquisition systems specifically for dental practices. Here's what we typically set up for clinics like yours:</p>
<ul>
  <li>🎯 <strong>Google &amp; Meta Ads</strong> — targeted campaigns for "dentist near me" and high-value treatments (implants, Invisalign, whitening)</li>
  <li>📱 <strong>Social Media Management</strong> — before/after content, patient stories, and educational posts on Instagram &amp; Facebook</li>
  <li>🤖 <strong>AI Chatbot for your website</strong> — answers patient questions 24/7 and books appointments automatically</li>
  <li>📊 <strong>Monthly performance reports</strong> — exactly how many new inquiries came from each channel</li>
  <li>✍️ <strong>Content creation</strong> — we handle photos, captions, ad copy — everything</li>
</ul>
<p>Dental practices we work with typically see <strong>15–25 new patient inquiries per month</strong> within the first 60 days.</p>
<p>Would love to put together a custom plan for ${lead.clinicName || "your practice"}. Takes 2 minutes to tell us what you need:</p>
<p style="margin:24px 0;"><a href="${intakeFormUrl(token)}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">Tell us about your practice →</a></p>
<p>Best,<br><strong>Donia Batool</strong><br>Founder, NovaFlow AI<br><a href="https://novaflow-ai-rho.vercel.app" style="color:#2563eb;">novaflow-ai-rho.vercel.app</a></p>
<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
<p style="font-size:12px;color:#94a3b8;">NovaFlow AI · AI Agents, Automation &amp; Digital Marketing · donia1510aptech@gmail.com</p>
</div>`,
      },
      {
        channel: "email",
        delayMs: 1 * HOUR,
        subject: (lead) => `Re: Growing ${lead.clinicName || lead.name}'s patient base`,
        html: (lead, token) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;color:#1e293b;">
<p>Hi ${lead.name || "there"},</p>
<p>Just following up on my earlier email — wanted to make sure it didn't get buried.</p>
<p>I'd love to understand ${lead.clinicName || "your practice"} a little better before putting together a plan. The form takes about 2 minutes:</p>
<p style="margin:20px 0;"><a href="${intakeFormUrl(token)}" style="color:#2563eb;font-weight:600;">Fill out the quick form →</a></p>
<p>If you have questions first, just reply to this email — I read everything personally.</p>
<p>Donia<br>NovaFlow AI</p>
</div>`,
      },
      {
        channel: "email",
        delayMs: 3 * DAY,
        subject: (lead) => `What's working for dental practices in ${lead.city || "your area"} right now`,
        html: (lead, token) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;color:#1e293b;">
<p>Hi ${lead.name || "there"},</p>
<p>One quick insight from our work with dental clinics${lead.city ? ` in ${lead.city}` : ""}:</p>
<p style="background:#f0f9ff;border-left:4px solid #2563eb;padding:12px 16px;border-radius:4px;"><strong>Before/after patient posts on Instagram + Google Ads targeting high-intent keywords</strong> is the highest-ROI combination right now. Practices see 3–4x more bookings compared to running either channel alone.</p>
<p>We handle the entire setup — ads, content, copy, reporting. No extra work on your end.</p>
<p>If you'd like to see what this could look like for ${lead.clinicName || "your practice"}:</p>
<p style="margin:20px 0;"><a href="${intakeFormUrl(token)}" style="color:#2563eb;font-weight:600;">Tell us about your practice (2 min) →</a></p>
<p>Donia<br>NovaFlow AI · <a href="https://novaflow-ai-rho.vercel.app" style="color:#2563eb;">novaflow-ai-rho.vercel.app</a></p>
</div>`,
      },
      {
        channel: "email",
        delayMs: 15 * DAY,
        subject: () => `Last email from me — NovaFlow AI`,
        html: (lead, token) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;color:#1e293b;">
<p>Hi ${lead.name || "there"},</p>
<p>I've reached out a couple of times — I don't want to keep cluttering your inbox, so this will be my last email for now.</p>
<p>If the timing ever feels right to grow ${lead.clinicName || "your practice"}'s patient base, this link will always work:</p>
<p style="margin:20px 0;"><a href="${intakeFormUrl(token)}" style="color:#2563eb;font-weight:600;">novaflow-ai-rho.vercel.app — Get in touch →</a></p>
<p>You'll receive occasional tips from me (monthly at most). Unsubscribe anytime by replying "stop".</p>
<p>Wishing you a busy clinic,<br>Donia<br>NovaFlow AI</p>
</div>`,
        finalStep: true,
        onNoResponse: "not_interested",
      },
    ],
  },

  // ── 2. Interested — send booking link ─────────────────────────────────────
  interested_sequence: {
    name: "Interested — Book a Meeting",
    steps: [
      {
        channel: "email",
        delayMs: 0,
        subject: (lead) => `Thanks for your interest — let's book a call, ${lead.clinicName || lead.name}`,
        html: (lead) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;color:#1e293b;">
<p>Hi ${lead.name || "there"},</p>
<p>Thanks for filling out the form — I've read through your answers and I'm excited about what we can do for <strong>${lead.clinicName || "your practice"}</strong>.</p>
<p>Based on what you shared, here's what I'd propose for your clinic:</p>
<ul>
  <li>✅ Custom Google &amp; Meta Ads strategy targeting your ideal patient profile</li>
  <li>✅ Social media content calendar (we handle everything)</li>
  <li>✅ AI chatbot on your website for 24/7 patient queries &amp; bookings</li>
  <li>✅ Monthly reporting dashboard</li>
</ul>
<p>I'd love to walk you through this on a quick 15-minute call — no commitment, just a conversation.</p>
<p style="margin:24px 0;"><a href="${lead.bookingLink || "https://novaflow-ai-rho.vercel.app/contact"}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">Book your free strategy call →</a></p>
<p>Talk soon,<br><strong>Donia Batool</strong><br>NovaFlow AI · <a href="https://novaflow-ai-rho.vercel.app" style="color:#2563eb;">novaflow-ai-rho.vercel.app</a></p>
</div>`,
      },
      {
        channel: "email",
        delayMs: 1 * DAY,
        subject: () => `Re: Let's find a time`,
        html: (lead) => `
<p>Hi ${lead.name || "there"},</p>
<p>Just following up — grab a slot when you get a chance:</p>
<p><a href="${lead.bookingLink || "#"}">Book your free 15-minute call →</a></p>
<p>Donia<br>NovaFlow AI</p>`,
      },
      {
        channel: "email",
        delayMs: 3 * DAY,
        subject: () => `Still worth a conversation`,
        html: (lead) => `
<p>Hi ${lead.name || "there"},</p>
<p>Completely understand if things are busy — dental practices run flat out.</p>
<p>When you have 15 minutes, I'd love to show you what we've done for similar clinics:</p>
<p><a href="${lead.bookingLink || "#"}">Book here →</a></p>
<p>Donia<br>NovaFlow AI</p>`,
      },
      {
        channel: "email",
        delayMs: 7 * DAY,
        subject: () => `One thing before I close this out`,
        html: (lead) => `
<p>Hi ${lead.name || "there"},</p>
<p>Before I assume the timing isn't right — is there anything specific holding you back? Happy to answer questions over email if a call doesn't work right now.</p>
<p>Or book here: <a href="${lead.bookingLink || "#"}">Book a call →</a></p>
<p>Donia<br>NovaFlow AI</p>`,
      },
      {
        channel: "email",
        delayMs: 15 * DAY,
        subject: () => `Keeping the door open`,
        html: (lead) => `
<p>Hi ${lead.name || "there"},</p>
<p>I'll stop nudging — but if you ever want to revisit this, the booking link will always work:</p>
<p><a href="${lead.bookingLink || "#"}">Book a call →</a></p>
<p>You'll hear from me occasionally with tips and ideas. Unsubscribe anytime.</p>
<p>Donia<br>NovaFlow AI</p>`,
        finalStep: true,
        onNoResponse: "long_term_nurture",
      },
    ],
  },

  // ── 3. Pre-Meeting Reminders ──────────────────────────────────────────────
  // delayMs here = offset from NOW (negative = before meeting, calculated at schedule time)
  pre_meeting_reminder: {
    name: "Pre-Meeting Reminders",
    // Steps are scheduled relative to meeting_datetime, not sequence start
    relativeTo: "meeting_datetime",
    steps: [
      {
        channel: "email",
        offsetMs: -3 * DAY,  // 3 days before
        subject: (lead) => `Our call is in 3 days — ${lead.meetingDatetime || "soon"}`,
        html: (lead) => `
<p>Hi ${lead.name || "there"},</p>
<p>Looking forward to our call on <strong>${lead.meetingDatetime || "the scheduled date"}</strong>.</p>
<p>We'll cover: what's currently working for dental marketing in your area, and what a realistic growth plan for ${lead.clinicName || "your practice"} could look like. Should be a useful 15 minutes.</p>
<p>See you then,<br>Donia<br>NovaFlow AI</p>`,
      },
      {
        channel: "email",
        offsetMs: -1 * DAY,  // 24 hours before
        subject: (lead) => `Tomorrow — see you then`,
        html: (lead) => `
<p>Hi ${lead.name || "there"},</p>
<p>Quick reminder: we're on for tomorrow.</p>
${lead.meetingLink ? `<p>Join link: <a href="${lead.meetingLink}">${lead.meetingLink}</a></p>` : ""}
<p>Donia<br>NovaFlow AI</p>`,
      },
      {
        channel: "email",
        offsetMs: -1 * HOUR,  // 1 hour before
        subject: () => `Starting in 1 hour`,
        html: (lead) => `
<p>Hi ${lead.name || "there"},</p>
<p>We're on in an hour — see you soon!</p>
${lead.meetingLink ? `<p><a href="${lead.meetingLink}">Join the call →</a></p>` : ""}
<p>Donia<br>NovaFlow AI</p>`,
      },
    ],
  },

  // ── 4. No-Show Reschedule ─────────────────────────────────────────────────
  no_show_reschedule: {
    name: "No-Show Reschedule",
    steps: [
      {
        channel: "email",
        delayMs: 1 * HOUR,
        subject: () => `Missed you — want to reschedule?`,
        html: (lead) => `
<p>Hi ${lead.name || "there"},</p>
<p>We had a call today but it looks like something came up — no worries at all.</p>
<p>Want to pick a new time?</p>
<p><a href="${lead.bookingLink || "#"}">Reschedule here →</a></p>
<p>Donia<br>NovaFlow AI</p>`,
      },
      {
        channel: "email",
        delayMs: 1 * DAY,
        subject: () => `Re: Missed you`,
        html: (lead) => `
<p>Hi ${lead.name || "there"},</p>
<p>Still happy to connect when you're free:</p>
<p><a href="${lead.bookingLink || "#"}">Book a new time →</a></p>
<p>Donia<br>NovaFlow AI</p>`,
      },
      {
        channel: "email",
        delayMs: 3 * DAY,
        subject: () => `One more try`,
        html: (lead) => `
<p>Hi ${lead.name || "there"},</p>
<p>I know things get hectic. If you'd like to rebook:</p>
<p><a href="${lead.bookingLink || "#"}">Pick a time →</a></p>
<p>If the timing isn't right, no problem — just let me know.</p>
<p>Donia<br>NovaFlow AI</p>`,
      },
      {
        channel: "email",
        delayMs: 15 * DAY,
        subject: () => `Leaving the door open`,
        html: (lead) => `
<p>Hi ${lead.name || "there"},</p>
<p>I'll stop following up on the missed call — but if you'd like to connect at any point, I'm here.</p>
<p><a href="${lead.bookingLink || "#"}">Book a call anytime →</a></p>
<p>You'll get occasional tips from me. Unsubscribe anytime.</p>
<p>Donia<br>NovaFlow AI</p>`,
        finalStep: true,
        onNoResponse: "long_term_nurture",
      },
    ],
  },

  // ── 5. Not Interested — Re-engagement ────────────────────────────────────
  not_interested_reengagement: {
    name: "Not Interested Re-engagement",
    steps: [
      {
        channel: "email",
        delayMs: 1 * DAY,
        subject: () => `No pressure — but one question`,
        html: (lead, token) => `
<p>Hi ${lead.name || "there"},</p>
<p>Completely fine if the timing isn't right. I'm curious though — is there something specific that put you off? (Too busy? Already have someone? Budget?)</p>
<p>If things change, here's the form again:</p>
<p><a href="${intakeFormUrl(token)}">2-minute interest form →</a></p>
<p>Donia<br>NovaFlow AI</p>`,
      },
      {
        channel: "email",
        delayMs: 3 * DAY,
        subject: (lead) => `One stat for ${lead.clinicName || "your practice"}`,
        html: (lead, token) => `
<p>Hi ${lead.name || "there"},</p>
<p>Dental practices that run Google Ads + Instagram together see an average of 22 new patient inquiries per month within the first 60 days. That's patients who weren't finding them before.</p>
<p>If you're curious what that could look like for ${lead.clinicName || "your practice"}:</p>
<p><a href="${intakeFormUrl(token)}">Fill out the 2-minute form →</a></p>
<p>Donia<br>NovaFlow AI</p>`,
      },
      {
        channel: "email",
        delayMs: 7 * DAY,
        subject: () => `Worth a second look?`,
        html: (lead, token) => `
<p>Hi ${lead.name || "there"},</p>
<p>I'll keep this short — if you're open to it, I'd love to show you a quick strategy for ${lead.clinicName || "your practice"} with no commitment.</p>
<p><a href="${intakeFormUrl(token)}">Let us know what you're interested in →</a></p>
<p>Donia<br>NovaFlow AI</p>`,
      },
      {
        channel: "email",
        delayMs: 15 * DAY,
        subject: () => `My last email — promise`,
        html: (lead, token) => `
<p>Hi ${lead.name || "there"},</p>
<p>This is my last follow-up — I don't want to clutter your inbox.</p>
<p>If you ever reconsider, the form will always be here:</p>
<p><a href="${intakeFormUrl(token)}">2-minute interest form →</a></p>
<p>You'll get one monthly email from me with useful tips. Unsubscribe anytime.</p>
<p>Donia<br>NovaFlow AI</p>`,
        finalStep: true,
        onNoResponse: "long_term_nurture",
      },
    ],
  },

  // ── 6. Long-Term Nurture — monthly ───────────────────────────────────────
  long_term_nurture: {
    name: "Long-Term Nurture",
    steps: [
      {
        channel: "email",
        delayMs: 30 * DAY,
        subject: () => `Quick tip for dental practices this month`,
        html: (lead) => `
<p>Hi ${lead.name || "there"},</p>
<p>One thing that's been working really well for dental practices right now: <strong>before/after patient stories on Instagram get 3x more engagement than product posts</strong> — and they drive direct booking inquiries.</p>
<p>If you're ever ready to explore how we can help with this, I'm just one message away.</p>
<p>Take care,<br>Donia<br>NovaFlow AI</p>`,
        repeat: true,  // this sequence repeats monthly
      },
    ],
  },

  // ── 7. Post-Meeting Follow-Up ─────────────────────────────────────────────
  post_meeting_follow_up: {
    name: "Post-Meeting Follow-Up",
    steps: [
      {
        channel: "email",
        delayMs: 0,
        subject: (lead) => `Great talking with you, ${lead.name || "Dr."}!`,
        html: (lead) => `
<p>Hi ${lead.name || "there"},</p>
<p>Really enjoyed learning about ${lead.clinicName || "your practice"} today!</p>
<p>As we discussed, here's what we can do for you:</p>
<ul>
  <li>✅ Targeted Google &amp; Meta Ads for patient acquisition</li>
  <li>✅ Social media management (Facebook + Instagram)</li>
  <li>✅ Custom content creation</li>
  <li>✅ Monthly performance reports</li>
  <li>✅ Dedicated account manager</li>
</ul>
<p>I'll send over a full proposal within 24 hours. In the meantime, feel free to reply with any questions.</p>
<p>Best,<br>Donia<br>NovaFlow AI</p>`,
      },
    ],
  },

  // ── 8. Onboarding Handoff — notify Donia ─────────────────────────────────
  onboarding_handoff: {
    name: "Onboarding Handoff",
    steps: [
      {
        channel: "email",
        delayMs: 0,
        subject: (lead) => `🏆 New client: ${lead.clinicName || lead.name}!`,
        toOwner: true,  // send to OWNER_EMAIL, not the lead
        html: (lead) => `
<p>Hi Donia,</p>
<p>Great news — <strong>${lead.name}</strong> from <strong>${lead.clinicName || "their clinic"}</strong> is now a client! 🎉</p>
<p><strong>Contact:</strong> ${lead.email || "—"} / ${lead.phone || "—"}</p>
<p><strong>City:</strong> ${lead.city || "—"}</p>
<p><strong>Source:</strong> ${lead.source || "unknown"}</p>
<p>Time to kick off onboarding. Atlas will set up their full stack shortly.</p>
<p>NovaFlow AI</p>`,
      },
    ],
  },
};

// ─── Schedule a sequence ──────────────────────────────────────────────────────

/**
 * Schedule all email steps for a sequence into outreach_schedule table.
 * @param {string} sequenceKey - key from SEQUENCES
 * @param {object} lead - { id, name, email, phone, clinicName, city, bookingLink, meetingDatetime, meetingLink, source, intakeToken }
 * @returns {{ scheduled: number, skipped: number }}
 */
export async function scheduleSequence({ sequenceKey, lead }) {
  const sequence = SEQUENCES[sequenceKey];
  if (!sequence) throw new Error(`Unknown sequence: "${sequenceKey}"`);
  if (!lead?.id) throw new Error("lead.id is required");

  const sb = getSupabase();
  if (!sb) {
    console.log(`[Max DEV] Would schedule "${sequenceKey}" for lead ${lead.id}`);
    return { scheduled: 0, skipped: 0, dev: true };
  }

  // Cancel any existing pending steps for this sequence+lead
  await sb
    .from("outreach_schedule")
    .update({ status: "cancelled" })
    .eq("lead_id", lead.id)
    .eq("sequence_key", sequenceKey)
    .eq("status", "pending");

  const ownerEmail = process.env.OWNER_EMAIL;
  const now = Date.now();
  const rows = [];

  for (let i = 0; i < sequence.steps.length; i++) {
    const step = sequence.steps[i];

    // Determine send_at
    let sendAt;
    if (sequence.relativeTo === "meeting_datetime" && lead.meetingDatetime) {
      const meetingMs = new Date(lead.meetingDatetime).getTime();
      sendAt = new Date(meetingMs + (step.offsetMs || 0));
    } else {
      sendAt = new Date(now + (step.delayMs || 0));
    }

    // Skip if send_at is in the past (e.g. pre-meeting reminder for today)
    if (sendAt.getTime() < now - 5 * 60 * 1000) continue;

    const toEmail = step.toOwner ? ownerEmail : lead.email;
    if (step.channel === "email" && !toEmail) continue;
    if (step.channel === "whatsapp" && !lead.phone) continue;

    const subject = typeof step.subject === "function" ? step.subject(lead) : (step.subject || "");
    const html    = typeof step.html    === "function" ? step.html(lead, lead.intakeToken || "") : (step.html || "");
    const message = typeof step.message === "function" ? step.message(lead) : (step.message || "");

    rows.push({
      lead_id:      lead.id,
      sequence_key: sequenceKey,
      step_index:   i,
      channel:      step.channel,
      subject:      subject || null,
      html:         html || null,
      text_body:    message || null,
      to_email:     step.channel === "email" ? toEmail : null,
      to_phone:     step.channel === "whatsapp" ? lead.phone : null,
      send_at:      sendAt.toISOString(),
      status:       "pending",
    });
  }

  if (!rows.length) return { scheduled: 0, skipped: sequence.steps.length };

  const { error } = await sb.from("outreach_schedule").insert(rows);
  if (error) throw new Error(`Schedule insert failed: ${error.message}`);

  return { scheduled: rows.length, skipped: sequence.steps.length - rows.length };
}

// ─── Send a single email (Brevo SMTP) ────────────────────────────────────────

export async function sendEmail({ to, subject, html, text, fromName, replyTo } = {}) {
  if (!to)      throw new Error("to is required");
  if (!subject) throw new Error("subject is required");
  if (!html && !text) throw new Error("html or text body is required");

  const smtp      = getSmtpConfig();
  const fromEmail = process.env.SMTP_USER || "noreply@novaflow.ai";
  const from      = fromName ? `${fromName} <${fromEmail}>` : `NovaFlow AI <${fromEmail}>`;

  if (!smtp) {
    console.log(`[Max DEV] Email to: ${to} | Subject: ${subject}`);
    return { sent: false, dev: true, to, subject };
  }

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.default.createTransport({
    host:   smtp.host,
    port:   smtp.port,
    secure: smtp.port === 465,
    auth:   { user: smtp.user, pass: smtp.pass },
  });

  await transporter.sendMail({
    from,
    to,
    subject,
    html:    html  || undefined,
    text:    text  || undefined,
    replyTo: replyTo || fromEmail,
  });

  return { sent: true, to, subject };
}

// ─── Send a WhatsApp message (Twilio) ────────────────────────────────────────

export async function sendWhatsApp({ to, message } = {}) {
  if (!to)      throw new Error("to is required");
  if (!message) throw new Error("message is required");

  const twilio = getTwilioConfig();
  if (!twilio) {
    console.log(`[Max DEV] WhatsApp to: ${to} | Message: ${message}`);
    return { sent: false, dev: true, to, message };
  }

  const url  = `https://api.twilio.com/2010-04-01/Accounts/${twilio.sid}/Messages.json`;
  const body = new URLSearchParams({
    From: `whatsapp:${twilio.from}`,
    To:   `whatsapp:${to}`,
    Body: message,
  });
  const auth = Buffer.from(`${twilio.sid}:${twilio.token}`).toString("base64");

  const res  = await fetch(url, {
    method:  "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Twilio error: ${json.message || res.status}`);

  return { sent: true, sid: json.sid, to, message };
}

// ─── Trigger a sequence immediately (legacy / chat use) ──────────────────────

export async function triggerSequence({ trigger, lead = {} } = {}) {
  if (!trigger) throw new Error("trigger name is required");
  const result = await scheduleSequence({ sequenceKey: trigger, lead });
  return { trigger, sequenceKey: trigger, ...result };
}

// ─── Get outreach history for a lead ─────────────────────────────────────────

export async function getOutreachHistory({ leadId, limit = 20 } = {}) {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("outreach_schedule")
    .select("id, sequence_key, step_index, channel, subject, send_at, sent_at, status, error")
    .eq("lead_id", leadId)
    .order("send_at", { ascending: false })
    .limit(limit);
  return data || [];
}

// ─── Get all pending leads with their pipeline stage (for Max panel) ─────────

export async function getPipelineLeads({ stage } = {}) {
  const sb = getSupabase();
  if (!sb) return [];
  let q = sb
    .from("agency_leads")
    .select("id, name, organization_name, email, phone, city, stage, intake_token, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (stage) q = q.eq("stage", stage);
  const { data } = await q;
  return data || [];
}
