/**
 * Nora — Content Agent (OpenAI Agents SDK)
 *
 * Wraps nora-agent.js pure functions as SDK tools.
 */

import { Agent, tool } from "@openai/agents";
import { z } from "zod";
import {
  generateEmailTemplates,
  generateProposal,
  generateSocialPost,
  generateAdCopy,
  listTemplates,
  getTemplate,
  deleteTemplate,
  postToMeta,
  getPageInsights,
  createCanvaDesign,
  exportCanvaDesign,
  getNoraConfig,
} from "../nora-agent.js";

// ─── Tools ───────────────────────────────────────────────────────────────────

const generateEmailTemplatesTool = tool({
  name: "generate_email_templates",
  description:
    "Generate a 4-email cold outreach sequence for a given industry: Day 1 intro, Day 3 follow-up, Day 7 proposal, Day 14 final. All emails include [FIRST_NAME], [BUSINESS_NAME], and [BOOKING_LINK] placeholders.",
  parameters: z.object({
    industry: z.string().describe("Target industry (e.g. 'dental', 'real estate')"),
    senderName: z
      .string()
      .nullable()
      .describe("Sender name shown in the email (e.g. 'Donia from DentaFlow')"),
    customNote: z
      .string()
      .nullable()
      .describe("Additional context to personalize the emails"),
  }),
  execute: async ({ industry, senderName, customNote }) => {
    const template = await generateEmailTemplates({
      industry,
      senderName: senderName || "",
      customNote: customNote || "",
    });
    return JSON.stringify({
      id: template.id,
      industry: template.industry,
      emails: template.emails,
    });
  },
});

const generateProposalTool = tool({
  name: "generate_proposal",
  description: "Generate a personalized business proposal for a specific lead.",
  parameters: z.object({
    industry: z.string().describe("Lead's industry"),
    leadName: z.string().describe("Lead's name"),
    businessName: z.string().describe("Lead's business name"),
    painPoint: z.string().describe("Main pain point or challenge to address"),
    senderName: z.string().nullable().describe("Sender name"),
  }),
  execute: async ({ industry, leadName, businessName, painPoint, senderName }) => {
    const template = await generateProposal({
      industry,
      leadName,
      businessName,
      painPoint,
      senderName: senderName || "",
    });
    return JSON.stringify({ id: template.id, content: template.content });
  },
});

const generateSocialPostTool = tool({
  name: "generate_social_post",
  description: "Generate a social media post for LinkedIn, Facebook, or Instagram.",
  parameters: z.object({
    industry: z.string().describe("Target industry for the audience"),
    platform: z
      .enum(["linkedin", "facebook", "instagram"])
      .describe("Social media platform"),
    topic: z.string().describe("Topic or theme of the post"),
    tone: z
      .enum(["professional", "casual", "educational", "promotional"])
      .nullable()
      .describe("Tone of voice"),
  }),
  execute: async ({ industry, platform, topic, tone }) => {
    const template = await generateSocialPost({
      industry,
      platform,
      topic,
      tone: tone || "professional",
    });
    return JSON.stringify({ id: template.id, platform: template.platform, content: template.content });
  },
});

const generateAdCopyTool = tool({
  name: "generate_ad_copy",
  description: "Generate Google or Meta (Facebook/Instagram) ad copy.",
  parameters: z.object({
    industry: z.string().describe("Target industry"),
    platform: z.enum(["google", "meta"]).describe("Ad platform"),
    offer: z.string().describe("The offer or service being advertised"),
    targetAudience: z
      .string()
      .nullable()
      .describe("Who the ad targets (e.g. 'dental practice owners in London')"),
  }),
  execute: async ({ industry, platform, offer, targetAudience }) => {
    const template = await generateAdCopy({ industry, platform, offer, targetAudience });
    return JSON.stringify({ id: template.id, platform: template.platform, content: template.content });
  },
});

const listTemplatesTool = tool({
  name: "list_templates",
  description: "List saved content templates, optionally filtered by type.",
  parameters: z.object({
    type: z
      .enum(["email-sequence", "proposal", "social-post", "ad-copy"])
      .nullable()
      .describe("Filter by template type"),
  }),
  execute: async ({ type } = {}) => {
    const templates = await listTemplates({ type });
    return JSON.stringify({
      count: templates.length,
      templates: templates.map((t) => ({
        id: t.id,
        type: t.type,
        industry: t.industry,
        createdAt: t.createdAt,
      })),
    });
  },
});

const deleteTemplateTool = tool({
  name: "delete_template",
  description: "Delete a saved template by ID.",
  parameters: z.object({
    templateId: z.string().describe("Template ID to delete"),
  }),
  execute: async ({ templateId }) => {
    const result = await deleteTemplate(templateId);
    return JSON.stringify(result);
  },
});

const postToMetaTool = tool({
  name: "post_to_meta",
  description:
    "Publish a post to a Facebook Page and/or Instagram. Requires META_PAGE_ACCESS_TOKEN and META_PAGE_ID. Falls back to console log in dev.",
  parameters: z.object({
    message: z.string().describe("Post caption or text"),
    imageUrl: z.string().nullable().describe("Public URL of image to attach (required for Instagram)"),
    platform: z
      .enum(["facebook", "instagram", "both"])
      .nullable()
      .describe("Where to post (default: both)"),
  }),
  execute: async ({ message, imageUrl, platform }) => {
    const result = await postToMeta({ message, imageUrl, platform });
    return JSON.stringify(result);
  },
});

const getPageInsightsTool = tool({
  name: "get_page_insights",
  description: "Get Facebook Page analytics — reach, impressions, engagement.",
  parameters: z.object({
    metric: z
      .string()
      .describe(
        "Metric name (e.g. page_impressions, page_reach, page_engaged_users, page_post_engagements)"
      ),
    period: z
      .enum(["day", "week", "days_28", "month"])
      .nullable()
      .describe("Aggregation period (default: day)"),
  }),
  execute: async ({ metric, period }) => {
    const result = await getPageInsights({ metric, period });
    return JSON.stringify(result);
  },
});

const createCanvaDesignTool = tool({
  name: "create_canva_design",
  description:
    "Create a new Canva design for a social media post or ad. Returns an edit URL to open in Canva. Falls back to a Canva.com direct link in dev.",
  parameters: z.object({
    designType: z
      .enum(["instagram_post", "facebook_post", "linkedin_post", "google_ad"])
      .describe("Type of design to create"),
    title: z.string().nullable().describe("Design title shown in Canva"),
    brandColor: z.string().nullable().describe("Brand hex color (e.g. #2563eb)"),
  }),
  execute: async ({ designType, title, brandColor }) => {
    const result = await createCanvaDesign({ designType, title, brandColor });
    return JSON.stringify(result);
  },
});

const exportCanvaDesignTool = tool({
  name: "export_canva_design",
  description: "Export a Canva design as PNG, JPG, or PDF. Returns a download URL.",
  parameters: z.object({
    designId: z.string().describe("Canva design ID from create_canva_design"),
    format: z.enum(["PNG", "JPG", "PDF"]).nullable().describe("Export format (default: PNG)"),
  }),
  execute: async ({ designId, format }) => {
    const result = await exportCanvaDesign({ designId, format });
    return JSON.stringify(result);
  },
});

const getNoraStatusTool = tool({
  name: "get_nora_status",
  description: "Check which Nora integrations are configured: OpenAI, Meta Graph API, Canva.",
  parameters: z.object({}),
  execute: async () => {
    const config = getNoraConfig();
    return JSON.stringify(config);
  },
});

// ─── Agent ───────────────────────────────────────────────────────────────────

export const noraAgent = new Agent({
  name: "Nora",
  instructions: `You are Nora ✍️, the Content Creator for DentaFlow — a dental marketing agency platform.

Your job:
1. CONTENT GENERATION
   - Cold outreach email sequences (4-step: intro → follow-up → proposal → final)
   - Personalized proposals for dental leads
   - Social posts for LinkedIn, Facebook, Instagram
   - Google + Meta ad copy
   - Manage template library

2. META PUBLISHING
   - Publish posts to Facebook Page and Instagram
   - Check page reach/impressions/engagement via get_page_insights
   - Instagram posts require an image URL

3. CANVA DESIGN
   - Create designs for instagram_post, facebook_post, linkedin_post, google_ad
   - Returns an edit URL to open in Canva
   - Export as PNG/PDF when ready

Content guidelines:
- Emails: [FIRST_NAME], [BUSINESS_NAME], [BOOKING_LINK] placeholders; max 120 words
- Proposals: 400 words max; sections: Problem, Solution, Why Us, Next Steps
- LinkedIn: professional, 200 words; Facebook: conversational, 150 words; Instagram: energetic, 120 words
- Google Ads: Headlines ≤30 chars, Descriptions ≤90 chars

Workflow for social media:
1. Generate post text with generate_social_post
2. Create visual with create_canva_design → user edits in Canva
3. Publish with post_to_meta (image URL required for Instagram)

Always call get_nora_status first if user asks about connectivity or missing integrations.`,
  tools: [
    generateEmailTemplatesTool,
    generateProposalTool,
    generateSocialPostTool,
    generateAdCopyTool,
    listTemplatesTool,
    deleteTemplateTool,
    postToMetaTool,
    getPageInsightsTool,
    createCanvaDesignTool,
    exportCanvaDesignTool,
    getNoraStatusTool,
  ],
});
