import fs from "fs/promises";
import path from "path";
import OpenAI from "openai";

const TEMPLATES_FILE = path.join(process.cwd(), "data", "nora-templates.json");

async function readTemplates() {
  try {
    const raw = await fs.readFile(TEMPLATES_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { templates: [] };
  }
}

async function saveTemplate(template) {
  const { templates } = await readTemplates();
  const existing = templates.findIndex((t) => t.id === template.id);
  if (existing >= 0) {
    templates[existing] = template;
  } else {
    templates.push(template);
  }
  await fs.mkdir(path.dirname(TEMPLATES_FILE), { recursive: true });
  await fs.writeFile(TEMPLATES_FILE, JSON.stringify({ templates }, null, 2));
  return template;
}

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function openaiClient() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing in .env");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function callAI(systemPrompt, userPrompt) {
  const client = openaiClient();
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1200,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  return response.choices?.[0]?.message?.content || "";
}

// ─── Email templates ──────────────────────────────────────────────────────────

export async function generateEmailTemplates({ industry, senderName = "Your Team", customNote = "" }) {
  const system = `You are an expert B2B email copywriter. Write concise, professional cold outreach emails for the ${industry} industry.
Rules: No fluff. Clear value proposition. Max 120 words per email. Include [FIRST_NAME] and [BUSINESS_NAME] placeholders.`;

  const emails = {};

  const prompts = {
    intro: `Write a Day 1 introduction cold email for a ${industry} business. Goal: introduce our services, spark curiosity, end with a soft CTA. Sender: ${senderName}. ${customNote}`,
    followup: `Write a Day 3 follow-up email for a ${industry} business who didn't reply to our intro email. Reference the previous email briefly. Warmer tone.`,
    proposal: `Write a Day 7 proposal email for a ${industry} business. Include a clear value offer, mention we'd love to schedule a 15-min call, and include [BOOKING_LINK] placeholder.`,
    final: `Write a Day 14 final follow-up for a ${industry} business. Friendly, no pressure. Offer to reconnect anytime.`,
  };

  for (const [key, prompt] of Object.entries(prompts)) {
    emails[key] = await callAI(system, prompt);
  }

  const template = {
    id: generateId("email"),
    type: "email-sequence",
    industry,
    senderName,
    createdAt: new Date().toISOString(),
    emails,
  };

  await saveTemplate(template);
  return template;
}

// ─── Proposal ─────────────────────────────────────────────────────────────────

export async function generateProposal({ industry, leadName, businessName, painPoint, senderName = "Your Team" }) {
  const system = `You are a professional B2B proposal writer. Write a concise, personalized business proposal. Max 400 words. Use clear sections: Problem, Our Solution, Why Us, Next Steps.`;
  const prompt = `Write a proposal for:
- Lead: ${leadName} at ${businessName}
- Industry: ${industry}
- Pain point / context: ${painPoint}
- Sender: ${senderName}

Include [BOOKING_LINK] where they should schedule a call.`;

  const content = await callAI(system, prompt);

  const template = {
    id: generateId("proposal"),
    type: "proposal",
    industry,
    leadName,
    businessName,
    painPoint,
    createdAt: new Date().toISOString(),
    content,
  };

  await saveTemplate(template);
  return template;
}

// ─── Social posts ─────────────────────────────────────────────────────────────

export async function generateSocialPost({ industry, platform, topic, tone = "professional" }) {
  const platformRules = {
    linkedin: "LinkedIn post. Professional tone. Max 200 words. Add 3-5 relevant hashtags. Hook in first line.",
    facebook: "Facebook post. Conversational and warm tone. Max 150 words. Ask an engaging question at the end. 2-3 hashtags.",
    instagram: "Instagram caption. Energetic and visual tone. Max 120 words. Emojis welcome. 5-8 hashtags at end.",
  };

  const rule = platformRules[platform.toLowerCase()] || platformRules.linkedin;
  const system = `You are an expert social media copywriter. ${rule}`;
  const prompt = `Write a ${platform} post about: ${topic}\nTarget audience: ${industry} business owners\nTone: ${tone}`;

  const content = await callAI(system, prompt);

  const template = {
    id: generateId("social"),
    type: "social-post",
    industry,
    platform,
    topic,
    createdAt: new Date().toISOString(),
    content,
  };

  await saveTemplate(template);
  return template;
}

// ─── Ad copy ──────────────────────────────────────────────────────────────────

export async function generateAdCopy({ industry, platform, offer, targetAudience }) {
  const formats = {
    google: `Write a Google Search Ad for a ${industry} service. Format:
Headline 1 (max 30 chars): 
Headline 2 (max 30 chars):
Headline 3 (max 30 chars):
Description 1 (max 90 chars):
Description 2 (max 90 chars):`,
    meta: `Write a Meta (Facebook/Instagram) Ad for a ${industry} service. Format:
Primary Text (max 125 chars):
Headline (max 40 chars):
Description (max 30 chars):
Call to Action: `,
  };

  const format = formats[platform.toLowerCase()] || formats.meta;
  const system = `You are an expert digital advertising copywriter. Write high-converting ad copy. Follow format exactly.`;
  const prompt = `${format}
Offer: ${offer}
Target Audience: ${targetAudience || industry + " business owners"}`;

  const content = await callAI(system, prompt);

  const template = {
    id: generateId("ad"),
    type: "ad-copy",
    industry,
    platform,
    offer,
    createdAt: new Date().toISOString(),
    content,
  };

  await saveTemplate(template);
  return template;
}

// ─── List templates ───────────────────────────────────────────────────────────

export async function listTemplates({ type } = {}) {
  const { templates } = await readTemplates();
  if (!type) return templates;
  return templates.filter((t) => t.type === type);
}

export async function getTemplate(id) {
  const { templates } = await readTemplates();
  return templates.find((t) => t.id === id) || null;
}

export async function deleteTemplate(id) {
  const { templates } = await readTemplates();
  const filtered = templates.filter((t) => t.id !== id);
  await fs.writeFile(TEMPLATES_FILE, JSON.stringify({ templates: filtered }, null, 2));
  return { deleted: id };
}

// ─── Meta Graph API ───────────────────────────────────────────────────────────

function getMetaConfig() {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  const pageId = process.env.META_PAGE_ID;
  if (!token || !pageId) return null;
  return { token, pageId };
}

/**
 * Publish a post to a Facebook Page and optionally Instagram.
 * Falls back to console.log in dev (no META_ credentials).
 *
 * @param {object} params
 * @param {string} params.message      - Post caption / text
 * @param {string} [params.imageUrl]   - Public URL of image to attach
 * @param {"facebook"|"instagram"|"both"} [params.platform] - Where to post (default: "both")
 * @returns {{ posted: boolean, dev?: boolean, results: object[] }}
 */
export async function postToMeta({ message, imageUrl, platform = "both" } = {}) {
  if (!message) throw new Error("message is required");

  const meta = getMetaConfig();
  if (!meta) {
    console.log(`[Nora DEV] Meta post | Platform: ${platform} | Message: ${message.slice(0, 80)}...`);
    return { posted: false, dev: true, platform, message };
  }

  const BASE = "https://graph.facebook.com/v19.0";
  const results = [];

  // ── Facebook ──
  if (platform === "facebook" || platform === "both") {
    const fbBody = new URLSearchParams({ message, access_token: meta.token });
    if (imageUrl) fbBody.set("link", imageUrl);

    const fbRes = await fetch(`${BASE}/${meta.pageId}/feed`, {
      method: "POST",
      body: fbBody,
    });
    const fbJson = await fbRes.json().catch(() => ({}));
    if (!fbRes.ok) throw new Error(`Facebook post failed: ${fbJson.error?.message || fbRes.status}`);
    results.push({ channel: "facebook", postId: fbJson.id });
  }

  // ── Instagram (requires image) ──
  if ((platform === "instagram" || platform === "both") && imageUrl) {
    // Step 1: create media container
    const containerRes = await fetch(`${BASE}/${meta.pageId}/media`, {
      method: "POST",
      body: new URLSearchParams({
        image_url: imageUrl,
        caption: message,
        access_token: meta.token,
      }),
    });
    const container = await containerRes.json().catch(() => ({}));
    if (!containerRes.ok) {
      throw new Error(`Instagram container failed: ${container.error?.message || containerRes.status}`);
    }

    // Step 2: publish
    const publishRes = await fetch(`${BASE}/${meta.pageId}/media_publish`, {
      method: "POST",
      body: new URLSearchParams({
        creation_id: container.id,
        access_token: meta.token,
      }),
    });
    const published = await publishRes.json().catch(() => ({}));
    if (!publishRes.ok) {
      throw new Error(`Instagram publish failed: ${published.error?.message || publishRes.status}`);
    }
    results.push({ channel: "instagram", postId: published.id });
  }

  return { posted: true, platform, results };
}

/**
 * Get Facebook Page insights (reach, impressions, engagement).
 *
 * @param {object} params
 * @param {string} params.metric  - e.g. "page_impressions", "page_reach", "page_engaged_users"
 * @param {"day"|"week"|"days_28"|"month"} [params.period] - Aggregation period (default: "day")
 * @returns {{ metric, period, data: object[] }}
 */
export async function getPageInsights({ metric, period = "day" } = {}) {
  if (!metric) throw new Error("metric is required");

  const meta = getMetaConfig();
  if (!meta) {
    console.log(`[Nora DEV] Page insights | Metric: ${metric} | Period: ${period}`);
    return { posted: false, dev: true, metric, period, data: [] };
  }

  const url = new URL(`https://graph.facebook.com/v19.0/${meta.pageId}/insights`);
  url.searchParams.set("metric", metric);
  url.searchParams.set("period", period);
  url.searchParams.set("access_token", meta.token);

  const res = await fetch(url.toString());
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Insights failed: ${json.error?.message || res.status}`);

  return { metric, period, data: json.data || [] };
}

// ─── Canva Connect API ────────────────────────────────────────────────────────

function getCanvaConfig() {
  const clientId = process.env.CANVA_CLIENT_ID;
  const accessToken = process.env.CANVA_ACCESS_TOKEN;
  if (!clientId || !accessToken) return null;
  return { clientId, accessToken };
}

/**
 * Create a Canva design from a template type.
 * Falls back to a direct Canva.com link in dev (no CANVA_ credentials).
 *
 * @param {object} params
 * @param {"instagram_post"|"facebook_post"|"linkedin_post"|"google_ad"} params.designType
 * @param {string} [params.title]      - Design title shown in Canva
 * @param {string} [params.brandColor] - Hex color for brand customization
 * @returns {{ created: boolean, designId?: string, editUrl: string, dev?: boolean }}
 */
export async function createCanvaDesign({ designType = "instagram_post", title, brandColor } = {}) {
  const DESIGN_TYPE_MAP = {
    instagram_post: "InstagramPost",
    facebook_post: "FacebookPost",
    linkedin_post: "LinkedInPost",
    google_ad: "Presentation",       // Canva uses Presentation as closest match
  };

  const canvaType = DESIGN_TYPE_MAP[designType] || "InstagramPost";
  const designTitle = title || `DentaFlow — ${designType.replace(/_/g, " ")}`;

  const canva = getCanvaConfig();
  if (!canva) {
    // Dev fallback: return a direct Canva creation URL so user can create manually
    const fallbackUrl = `https://www.canva.com/design/new?type=${canvaType}`;
    console.log(`[Nora DEV] Canva design | Type: ${designType} | Open: ${fallbackUrl}`);
    return {
      created: false,
      dev: true,
      designType,
      editUrl: fallbackUrl,
      instruction: `CANVA_CLIENT_ID or CANVA_ACCESS_TOKEN not set. Click the link to create manually: ${fallbackUrl}`,
    };
  }

  const res = await fetch("https://api.canva.com/rest/v1/designs", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${canva.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      asset_type: canvaType,
      title: designTitle,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Canva API error: ${json.message || json.error || res.status}`);
  }

  const design = json.design;
  return {
    created: true,
    designId: design?.id,
    designType,
    title: design?.title || designTitle,
    editUrl: design?.urls?.edit_url || `https://www.canva.com/design/${design?.id}/edit`,
    thumbnailUrl: design?.thumbnail?.url || null,
  };
}

/**
 * Export a Canva design as PNG or PDF.
 *
 * @param {object} params
 * @param {string} params.designId  - Canva design ID from createCanvaDesign
 * @param {"PNG"|"PDF"|"JPG"} [params.format] - Export format (default: PNG)
 * @returns {{ exportUrl: string, format: string }}
 */
export async function exportCanvaDesign({ designId, format = "PNG" } = {}) {
  if (!designId) throw new Error("designId is required");

  const canva = getCanvaConfig();
  if (!canva) {
    return { dev: true, message: "CANVA_ACCESS_TOKEN not set — cannot export." };
  }

  // Create export job
  const exportRes = await fetch("https://api.canva.com/rest/v1/exports", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${canva.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      design_id: designId,
      format: { type: format },
    }),
  });

  const exportJson = await exportRes.json().catch(() => ({}));
  if (!exportRes.ok) {
    throw new Error(`Canva export failed: ${exportJson.message || exportRes.status}`);
  }

  const jobId = exportJson.job?.id;
  if (!jobId) throw new Error("Canva export job ID not returned");

  // Poll for completion (max 30s)
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    await new Promise((r) => setTimeout(r, 2000));
    const statusRes = await fetch(`https://api.canva.com/rest/v1/exports/${jobId}`, {
      headers: { Authorization: `Bearer ${canva.accessToken}` },
    });
    const statusJson = await statusRes.json().catch(() => ({}));
    const job = statusJson.job;

    if (job?.status === "success") {
      return {
        format,
        designId,
        exportUrl: job.urls?.[0] || null,
      };
    }
    if (job?.status === "failed") {
      throw new Error(`Canva export job failed for design ${designId}`);
    }
  }

  throw new Error("Canva export timed out after 30s");
}

export function getNoraConfig() {
  return {
    aiConnected: Boolean(process.env.OPENAI_API_KEY),
    metaConnected: Boolean(getMetaConfig()),
    canvaConnected: Boolean(getCanvaConfig()),
  };
}
