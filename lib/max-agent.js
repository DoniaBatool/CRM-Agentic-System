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

/** Google Meet booking link — set NEXT_PUBLIC_BOOKING_URL in .env to your Google Calendar booking page */
function bookingUrl() {
  return process.env.NEXT_PUBLIC_BOOKING_URL || "https://novaflow-ai-rho.vercel.app/contact";
}

const SITE_URL = "https://novaflow-ai-rho.vercel.app";

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
      // ── Step 0: Welcome email (sent immediately) ───────────────────────────
      {
        channel: "email",
        delayMs: 0,
        subject: (lead) => `Hi ${lead.name ? lead.name.split(" ")[0] : "there"} — a quick intro from NovaFlow AI`,
        html: (lead, token) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:580px;margin:0 auto;color:#1e293b;background:#ffffff;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);padding:32px 36px;border-radius:12px 12px 0 0;">
    <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">NovaFlow <span style="color:#0ea5e9;">AI</span></p>
    <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">AI Agents · Automation · Digital Marketing</p>
  </div>

  <!-- Body -->
  <div style="padding:32px 36px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">

    <p style="margin:0 0 16px;font-size:16px;">Hi ${lead.name ? lead.name.split(" ")[0] : "there"} 👋</p>

    <p style="margin:0 0 16px;line-height:1.7;color:#374151;">
      Thanks for reaching out${lead.city ? ` from <strong>${lead.city}</strong>` : ""}! I'm <strong>Donia</strong>, founder of <strong>NovaFlow AI</strong>.
      ${lead.clinicName && lead.clinicName !== lead.name
        ? `I looked into <strong>${lead.clinicName}</strong> and I'd love to share a few ideas that could genuinely move the needle for your business.`
        : "I'd love to share what we do and see if we can help your business grow."}
    </p>

    <!-- What we do -->
    <div style="background:#f8fafc;border-radius:10px;padding:20px 24px;margin:20px 0;">
      <p style="margin:0 0 14px;font-weight:700;font-size:15px;color:#0f172a;">What NovaFlow AI does for you:</p>
      <table style="border-collapse:collapse;width:100%;">
        <tr>
          <td style="padding:6px 0;vertical-align:top;width:28px;font-size:18px;">🎯</td>
          <td style="padding:6px 0;vertical-align:top;"><strong>Google &amp; Meta Ads</strong> — targeted campaigns that bring in the right customers</td>
        </tr>
        <tr>
          <td style="padding:6px 0;vertical-align:top;font-size:18px;">📱</td>
          <td style="padding:6px 0;vertical-align:top;"><strong>Social Media Management</strong> — consistent, on-brand content on Instagram &amp; Facebook</td>
        </tr>
        <tr>
          <td style="padding:6px 0;vertical-align:top;font-size:18px;">🤖</td>
          <td style="padding:6px 0;vertical-align:top;"><strong>AI Automation</strong> — chatbots and workflows that capture and follow up on leads 24/7</td>
        </tr>
        <tr>
          <td style="padding:6px 0;vertical-align:top;font-size:18px;">✍️</td>
          <td style="padding:6px 0;vertical-align:top;"><strong>Content &amp; Copy</strong> — photos, captions, ad copy — we handle everything</td>
        </tr>
        <tr>
          <td style="padding:6px 0;vertical-align:top;font-size:18px;">📊</td>
          <td style="padding:6px 0;vertical-align:top;"><strong>Monthly Reports</strong> — exactly how many leads each channel generated</td>
        </tr>
      </table>
    </div>

    <p style="margin:0 0 20px;line-height:1.7;color:#374151;">
      Businesses we work with typically see <strong>15–25 new inquiries per month</strong> within the first 60 days — without increasing their own workload.
    </p>

    <!-- Primary CTA: Book a call -->
    <div style="text-align:center;margin:28px 0 16px;">
      <a href="${bookingUrl()}" style="background:#0ea5e9;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:700;font-size:15px;letter-spacing:0.2px;">
        📅 Book a free 15-min Google Meet call →
      </a>
    </div>
    <p style="text-align:center;margin:0 0 24px;font-size:13px;color:#64748b;">No preparation needed — just a quick conversation.</p>

    <!-- Divider with "or" -->
    <div style="display:flex;align-items:center;gap:12px;margin:20px 0;">
      <div style="flex:1;height:1px;background:#e2e8f0;"></div>
      <span style="font-size:12px;color:#94a3b8;white-space:nowrap;">or tell us about your business first</span>
      <div style="flex:1;height:1px;background:#e2e8f0;"></div>
    </div>

    <!-- Secondary CTA: interest form -->
    <div style="text-align:center;margin:16px 0 28px;">
      <a href="${intakeFormUrl(token)}" style="border:2px solid #0ea5e9;color:#0ea5e9;padding:11px 28px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;font-size:14px;">
        Tell us about your business (2 min) →
      </a>
    </div>

    <!-- See our work -->
    <div style="background:#eff6ff;border-radius:8px;padding:14px 18px;margin:20px 0;text-align:center;">
      <p style="margin:0;font-size:14px;color:#1e40af;">
        🌐 See our work &amp; past projects →
        <a href="${SITE_URL}/projects" style="color:#2563eb;font-weight:600;display:block;margin-top:4px;">${SITE_URL}/projects</a>
      </p>
    </div>

    <!-- Signature -->
    <p style="margin:24px 0 4px;line-height:1.7;">
      Looking forward to connecting,<br>
      <strong>Donia Batool</strong><br>
      <span style="color:#64748b;font-size:13px;">Founder &amp; CEO, NovaFlow AI</span>
    </p>
    <p style="margin:4px 0 0;font-size:13px;">
      <a href="${SITE_URL}" style="color:#0ea5e9;">${SITE_URL}</a> ·
      <a href="mailto:donia1510aptech@gmail.com" style="color:#64748b;">donia1510aptech@gmail.com</a>
    </p>

    <hr style="border:none;border-top:1px solid #f1f5f9;margin:24px 0 12px;">
    <p style="font-size:11px;color:#94a3b8;margin:0;">
      NovaFlow AI · AI Agents, Automation &amp; Digital Marketing<br>
      You're receiving this because you (or someone at ${lead.clinicName || "your organisation"}) reached out to us.
      Reply "stop" to unsubscribe.
    </p>
  </div>
</div>`,
      },

      // ── Step 1: Follow-up +24 hours ────────────────────────────────────────
      {
        channel: "email",
        delayMs: 1 * DAY,
        subject: (lead) => `Did you get a chance to look at my email? — NovaFlow AI`,
        html: (lead, token) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;color:#1e293b;">
<p>Hi ${lead.name ? lead.name.split(" ")[0] : "there"},</p>
<p>Just checking in — I sent over an intro email yesterday and wanted to make sure it didn't get lost in your inbox.</p>
<p>If you have 15 minutes this week, I'd love to jump on a quick Google Meet call and share a few specific ideas for ${lead.clinicName || "your business"}:</p>
<p style="margin:20px 0;"><a href="${bookingUrl()}" style="background:#0ea5e9;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">📅 Book a 15-min call →</a></p>
<p>Or if you'd prefer, fill out a quick 2-minute form first and I'll come prepared with a custom plan:</p>
<p style="margin:16px 0;"><a href="${intakeFormUrl(token)}" style="color:#0ea5e9;font-weight:600;">Tell us about your business →</a></p>
<p>Either way — no pressure, no commitment. Just a conversation.</p>
<p>Donia<br><span style="color:#64748b;font-size:13px;">NovaFlow AI · <a href="${SITE_URL}" style="color:#0ea5e9;">${SITE_URL}</a></span></p>
</div>`,
      },

      // ── Step 2: Follow-up +3 days ─────────────────────────────────────────
      {
        channel: "email",
        delayMs: 3 * DAY,
        subject: (lead) => `One thing that's working really well right now${lead.city ? ` in ${lead.city}` : ""}`,
        html: (lead, token) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;color:#1e293b;">
<p>Hi ${lead.name ? lead.name.split(" ")[0] : "there"},</p>
<p>Quick insight I thought you'd find useful:</p>
<div style="background:#f0f9ff;border-left:4px solid #0ea5e9;padding:14px 18px;border-radius:4px;margin:16px 0;">
  <p style="margin:0;"><strong>Businesses that combine Google Ads + consistent Instagram posting</strong> see 3–4× more inbound leads compared to running either channel alone — and the content pays off for months after it's posted.</p>
</div>
<p>We handle the entire setup for you — ads, content creation, captions, reporting. You focus on running your business; we fill your pipeline.</p>
<p>I'd love to put together a quick plan for ${lead.clinicName || "your business"} specifically. Two ways to do that:</p>
<p style="margin:16px 0;">
  <a href="${bookingUrl()}" style="background:#0ea5e9;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;margin-right:12px;">📅 Book a call</a>
  <a href="${intakeFormUrl(token)}" style="color:#0ea5e9;font-weight:600;">Fill the 2-min form →</a>
</p>
<p style="margin-top:20px;">Donia<br><span style="color:#64748b;font-size:13px;">NovaFlow AI · <a href="${SITE_URL}" style="color:#0ea5e9;">${SITE_URL}</a></span></p>
</div>`,
      },

      // ── Step 3: Follow-up +7 days ─────────────────────────────────────────
      {
        channel: "email",
        delayMs: 7 * DAY,
        subject: (lead) => `A quick look at what we've built — NovaFlow AI`,
        html: (lead, token) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;color:#1e293b;">
<p>Hi ${lead.name ? lead.name.split(" ")[0] : "there"},</p>
<p>I've reached out a few times — rather than another pitch, let me just show you what we've actually built for other businesses.</p>
<p>You can see real projects and case studies here:</p>
<p style="margin:16px 0;"><a href="${SITE_URL}/projects" style="background:#0f172a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">🌐 View our projects &amp; case studies →</a></p>
<p>If anything resonates, I'm happy to do the same for ${lead.clinicName || "your business"}. Book a call whenever it suits you:</p>
<p style="margin:16px 0;"><a href="${bookingUrl()}" style="color:#0ea5e9;font-weight:600;">📅 Book a free 15-min Google Meet →</a></p>
<p>Donia<br><span style="color:#64748b;font-size:13px;">NovaFlow AI</span></p>
</div>`,
      },

      // ── Step 4: Final email +15 days ──────────────────────────────────────
      {
        channel: "email",
        delayMs: 15 * DAY,
        subject: () => `My last email — NovaFlow AI`,
        html: (lead, token) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;color:#1e293b;">
<p>Hi ${lead.name ? lead.name.split(" ")[0] : "there"},</p>
<p>I've sent a few emails over the past couple of weeks — I don't want to keep cluttering your inbox, so this will be my last one for now.</p>
<p>If the timing ever feels right to grow ${lead.clinicName || "your business"}, these links will always work:</p>
<ul style="line-height:2;">
  <li><a href="${bookingUrl()}" style="color:#0ea5e9;">📅 Book a free 15-min Google Meet</a></li>
  <li><a href="${intakeFormUrl(token)}" style="color:#0ea5e9;">Tell us about your business (2-min form)</a></li>
  <li><a href="${SITE_URL}/projects" style="color:#0ea5e9;">See our work</a></li>
</ul>
<p>You'll receive the occasional tip from me (monthly at most). Reply "stop" to unsubscribe anytime.</p>
<p>Wishing you a busy, successful business,<br><strong>Donia</strong><br><span style="color:#64748b;font-size:13px;">NovaFlow AI</span></p>
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

      // ── Owner reminders — same 3 offsets, sent to OWNER_EMAIL (Donia) ──────
      {
        channel: "email",
        offsetMs: -3 * DAY,
        toOwner: true,
        subject: (lead) => `📅 Meeting reminder: ${lead.name || "Lead"} in 3 days`,
        html: (lead) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;color:#1e293b;">
<p>Hi Donia,</p>
<p>Reminder: you have a discovery call with <strong>${lead.name || "a lead"}</strong>${lead.clinicName && lead.clinicName !== lead.name ? ` from <strong>${lead.clinicName}</strong>` : ""} in <strong>3 days</strong>.</p>
<table style="border-collapse:collapse;margin:12px 0;">
  <tr><td style="color:#64748b;padding:4px 12px 4px 0;">📅 When</td><td style="font-weight:600;">${lead.meetingDatetime || "Check your calendar"}</td></tr>
  <tr><td style="color:#64748b;padding:4px 12px 4px 0;">👤 Lead</td><td>${lead.name || "—"}</td></tr>
  ${lead.clinicName && lead.clinicName !== lead.name ? `<tr><td style="color:#64748b;padding:4px 12px 4px 0;">🏢 Org</td><td>${lead.clinicName}</td></tr>` : ""}
  <tr><td style="color:#64748b;padding:4px 12px 4px 0;">📧 Email</td><td>${lead.email || "—"}</td></tr>
  <tr><td style="color:#64748b;padding:4px 12px 4px 0;">📞 Phone</td><td>${lead.phone || "—"}</td></tr>
  <tr><td style="color:#64748b;padding:4px 12px 4px 0;">🏙 City</td><td>${lead.city || "—"}</td></tr>
</table>
${lead.meetingLink ? `<p><a href="${lead.meetingLink}" style="color:#2563eb;">Join link →</a></p>` : ""}
<p style="color:#94a3b8;font-size:12px;">NovaFlow AI — automated reminder</p>
</div>`,
      },
      {
        channel: "email",
        offsetMs: -1 * DAY,
        toOwner: true,
        subject: (lead) => `📅 Tomorrow: call with ${lead.name || "lead"}`,
        html: (lead) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;color:#1e293b;">
<p>Hi Donia,</p>
<p>Your call with <strong>${lead.name || "a lead"}</strong>${lead.clinicName && lead.clinicName !== lead.name ? ` (${lead.clinicName})` : ""} is <strong>tomorrow</strong>.</p>
<p><strong>Scheduled:</strong> ${lead.meetingDatetime || "Check your calendar"}</p>
${lead.meetingLink ? `<p><a href="${lead.meetingLink}" style="color:#2563eb;">Join the call →</a></p>` : ""}
<p style="color:#94a3b8;font-size:12px;">NovaFlow AI — automated reminder</p>
</div>`,
      },
      {
        channel: "email",
        offsetMs: -1 * HOUR,
        toOwner: true,
        subject: (lead) => `🔔 Starting in 1 hour: ${lead.name || "lead"}'s call`,
        html: (lead) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;color:#1e293b;">
<p>Hi Donia,</p>
<p>Your call with <strong>${lead.name || "a lead"}</strong> starts in <strong>1 hour</strong>!</p>
${lead.meetingLink ? `<p style="margin:20px 0;"><a href="${lead.meetingLink}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;">Join the call →</a></p>` : ""}
<p><strong>Lead email:</strong> ${lead.email || "—"} | <strong>Phone:</strong> ${lead.phone || "—"}</p>
<p style="color:#94a3b8;font-size:12px;">NovaFlow AI — automated reminder</p>
</div>`,
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
