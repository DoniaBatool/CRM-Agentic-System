import { createHash } from "crypto";
import { getTemplate } from "./nora-agent.js";

function createMd5Hash(str) {
  return createHash("md5").update(str).digest("hex");
}

const MC_BASE = () => {
  const prefix = process.env.MAILCHIMP_SERVER_PREFIX;
  if (!prefix) throw new Error("MAILCHIMP_SERVER_PREFIX missing in .env (e.g. us1)");
  return `https://${prefix}.api.mailchimp.com/3.0`;
};

const MC_HEADERS = () => {
  const key = process.env.MAILCHIMP_API_KEY;
  if (!key) throw new Error("MAILCHIMP_API_KEY missing in .env");
  // Mailchimp uses HTTP Basic Auth: any_string:api_key
  const encoded = Buffer.from(`anystring:${key}`).toString("base64");
  return {
    Authorization: `Basic ${encoded}`,
    "Content-Type": "application/json",
  };
};

const MC_LIST_ID = () => {
  const id = process.env.MAILCHIMP_LIST_ID;
  if (!id) throw new Error("MAILCHIMP_LIST_ID missing in .env");
  return id;
};

async function mcFetch(path, options = {}) {
  const res = await fetch(`${MC_BASE()}${path}`, {
    ...options,
    headers: { ...MC_HEADERS(), ...(options.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Mailchimp ${options.method || "GET"} ${path}: ${json.detail || json.title || json.status || res.status} — ${json.type || ""}`);
  }
  return json;
}

// ─── Add contacts to Mailchimp audience ───────────────────────────────────────

export async function addLeadsToMailchimp(leads) {
  const listId = MC_LIST_ID();
  let added = 0;
  const errors = [];

  for (const lead of leads) {
    if (!lead.email) continue;
    try {
      // Use PUT /members/{hash} for upsert (add or update existing)
      const emailHash = createMd5Hash(lead.email.toLowerCase());
      await mcFetch(`/lists/${listId}/members/${emailHash}`, {
        method: "PUT",
        body: JSON.stringify({
          email_address: lead.email,
          status_if_new: "subscribed",
          merge_fields: {
            FNAME: (lead.name || "").split(" ")[0],
            LNAME: (lead.name || "").split(" ").slice(1).join(" "),
            PHONE: lead.phone || "",
            ADDRESS: lead.address || "",
            COMPANY: lead.name || "",
          },
        }),
      });
      added++;
    } catch (e) {
      console.error(`Mailchimp add failed for ${lead.email}:`, e.message);
      errors.push({ email: lead.email, error: e.message });
    }
  }

  return {
    added,
    errors: errors.length,
    errorDetails: errors,
  };
}

// ─── Create campaign ───────────────────────────────────────────────────────────

export async function createCampaign({ subject, fromName, replyTo, templateId, htmlBody, listId }) {
  const audience = listId || MC_LIST_ID();

  const campaign = await mcFetch("/campaigns", {
    method: "POST",
    body: JSON.stringify({
      type: "regular",
      recipients: { list_id: audience },
      settings: {
        subject_line: subject,
        from_name: fromName || process.env.MAILCHIMP_FROM_NAME || "Your Team",
        reply_to: replyTo || process.env.MAILCHIMP_REPLY_TO || "",
      },
    }),
  });

  const body = htmlBody || (templateId ? await getTemplate(templateId) : null);
  if (body) {
    const emailHtml = typeof body === "object" ? body.emails?.intro || "" : body;
    await mcFetch(`/campaigns/${campaign.id}/content`, {
      method: "PUT",
      body: JSON.stringify({ html: emailHtml }),
    });
  }

  return campaign;
}

// ─── Create drip sequence ──────────────────────────────────────────────────────

export async function createDripSequence({ templateId, industry, fromName, replyTo, listId, bookingLink = "" }) {
  const audience = listId || MC_LIST_ID();
  const template = templateId ? await getTemplate(templateId) : null;

  const sequenceConfig = [
    {
      day: 0,
      subject: template ? `${industry || "Business"} — Let's connect` : "Quick intro from our team",
      bodyKey: "intro",
      waitDays: 0,
    },
    {
      day: 3,
      subject: "Following up — wanted to check in",
      bodyKey: "followup",
      waitDays: 3,
    },
    {
      day: 7,
      subject: "Our proposal for you",
      bodyKey: "proposal",
      waitDays: 4,
    },
    {
      day: 14,
      subject: "Last note from our team",
      bodyKey: "final",
      waitDays: 7,
    },
  ];

  const createdCampaigns = [];

  for (const step of sequenceConfig) {
    let html = "";
    if (template?.emails?.[step.bodyKey]) {
      html = template.emails[step.bodyKey]
        .replace(/\n/g, "<br>")
        .replace(/\[BOOKING_LINK\]/g, bookingLink || "[BOOKING_LINK]");
    } else {
      html = `<p>${step.subject}</p>`;
    }

    const campaign = await createCampaign({
      subject: step.subject,
      fromName,
      replyTo,
      htmlBody: html,
      listId: audience,
    });

    createdCampaigns.push({
      day: step.day,
      campaignId: campaign.id,
      subject: step.subject,
      status: campaign.status,
    });
  }

  return { sequence: createdCampaigns, totalEmails: createdCampaigns.length };
}

// ─── Send / schedule campaign ──────────────────────────────────────────────────

export async function sendCampaign(campaignId) {
  await mcFetch(`/campaigns/${campaignId}/actions/send`, { method: "POST" });
  return { campaignId, sent: true };
}

export async function scheduleCampaign(campaignId, scheduleTime) {
  await mcFetch(`/campaigns/${campaignId}/actions/schedule`, {
    method: "POST",
    body: JSON.stringify({ schedule_time: scheduleTime }),
  });
  return { campaignId, scheduled: scheduleTime };
}

// ─── Get campaign stats ────────────────────────────────────────────────────────

export async function getCampaignStats(campaignId) {
  const data = await mcFetch(`/campaigns/${campaignId}`);
  const { report_summary: r, settings, status } = data;
  return {
    campaignId,
    subject: settings?.subject_line,
    status,
    opens: r?.opens || 0,
    uniqueOpens: r?.unique_opens || 0,
    clicks: r?.clicks || 0,
    uniqueClicks: r?.subscriber_clicks || 0,
    openRate: r?.open_rate ? `${(r.open_rate * 100).toFixed(1)}%` : "0%",
    clickRate: r?.click_rate ? `${(r.click_rate * 100).toFixed(1)}%` : "0%",
  };
}

export async function listCampaigns(count = 20) {
  const data = await mcFetch(`/campaigns?count=${count}&sort_field=create_time&sort_dir=DESC`);
  return (data.campaigns || []).map((c) => ({
    id: c.id,
    subject: c.settings?.subject_line || "",
    status: c.status,
    sendTime: c.send_time || null,
    emailsSent: c.emails_sent || 0,
    openRate: c.report_summary?.open_rate
      ? `${(c.report_summary.open_rate * 100).toFixed(1)}%`
      : "0%",
    clickRate: c.report_summary?.click_rate
      ? `${(c.report_summary.click_rate * 100).toFixed(1)}%`
      : "0%",
  }));
}

// ─── Get audience info ─────────────────────────────────────────────────────────

export async function getAudienceInfo() {
  const listId = MC_LIST_ID();
  const data = await mcFetch(`/lists/${listId}`);
  return {
    listId,
    name: data.name,
    memberCount: data.stats?.member_count || 0,
    openRate: data.stats?.open_rate ? `${(data.stats.open_rate * 100).toFixed(1)}%` : "0%",
    clickRate: data.stats?.click_rate ? `${(data.stats.click_rate * 100).toFixed(1)}%` : "0%",
  };
}
