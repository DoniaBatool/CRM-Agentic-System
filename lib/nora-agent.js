import fs from "fs/promises";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";

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

function anthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing in .env");
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

async function callAI(systemPrompt, userPrompt) {
  const client = anthropicClient();
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    messages: [
      { role: "user", content: `${systemPrompt}\n\n${userPrompt}` },
    ],
  });
  return msg.content?.[0]?.text || "";
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
