/**
 * Rex — Lead Scraper Agent (OpenAI Agents SDK)
 *
 * Wraps rex-agent.js pure functions as SDK tools.
 */

import { Agent, tool } from "@openai/agents";
import { z } from "zod";
import { searchLeads, getLeads, clearLeads, exportLeadsCsv, getRexConfig } from "../rex-agent.js";
import { getSupabase } from "../supabase.js";

// ─── Tools ───────────────────────────────────────────────────────────────────

const searchLeadsTool = tool({
  name: "search_leads",
  description:
    "Scrape Google Maps for dental business leads using Apify (falls back to Google Places API). Saves new leads and deduplicates.",
  parameters: z.object({
    query: z.string().describe("Search query (e.g. 'dental clinic', 'dentist')"),
    city: z.string().nullable().describe("City to search in (e.g. 'Houston', 'London')"),
    maxResults: z.number().nullable().describe("Max results to scrape (default 50)"),
  }),
  execute: async ({ query, city, maxResults }) => {
    const result = await searchLeads({ query, city, maxResults: maxResults || 50 });
    return JSON.stringify({
      query: result.query,
      source: result.source,
      totalFound: result.totalFound,
      newLeads: result.newLeads,
      filtered: result.filtered,
      // Include first 10 leads in response to avoid hitting token limits
      sample: result.leads.slice(0, 10),
    });
  },
});

const getLeadsTool = tool({
  name: "get_leads",
  description: "Get saved leads from local storage, optionally filtered by industry or city.",
  parameters: z.object({
    industry: z.string().nullable().describe("Filter by industry keyword"),
    city: z.string().nullable().describe("Filter by city"),
  }),
  execute: async ({ industry, city } = {}) => {
    const leads = await getLeads({ industry, city });
    return JSON.stringify({
      count: leads.length,
      leads: leads.slice(0, 20), // return first 20 to avoid token overflow
    });
  },
});

const exportCsvTool = tool({
  name: "export_leads_csv",
  description: "Export all saved leads as a CSV string.",
  parameters: z.object({}),
  execute: async () => {
    const csv = await exportLeadsCsv();
    return csv || "No leads saved yet.";
  },
});

const clearLeadsTool = tool({
  name: "clear_leads",
  description: "Clear all saved leads from local storage.",
  parameters: z.object({}),
  execute: async () => {
    const result = await clearLeads();
    return JSON.stringify(result);
  },
});

const getStatusTool = tool({
  name: "get_status",
  description: "Check Rex agent status — Apify and Google Places API connection. When to call: when user asks if Rex is configured or which API keys are missing.",
  parameters: z.object({}),
  execute: async () => JSON.stringify(getRexConfig()),
});

const addToPipelineTool = tool({
  name: "add_to_pipeline",
  description: "Add one or more Rex leads to the Iris pipeline (agency_leads table, new_lead stage). Search rex_leads by name first, then add matches.",
  parameters: z.object({
    name: z.string().describe("Lead name or partial business name to find in rex_leads and add to pipeline"),
  }),
  execute: async ({ name }) => {
    const sb = getSupabase();
    if (!sb) return JSON.stringify({ error: "Supabase not connected" });

    // Search rex_leads by name
    const { data: matches, error: searchErr } = await sb
      .from("rex_leads")
      .select("*")
      .ilike("name", `%${name.trim()}%`)
      .limit(10);

    if (searchErr) return JSON.stringify({ error: searchErr.message });
    if (!matches?.length) return JSON.stringify({ found: 0, message: `No leads found matching "${name}" in Rex saved leads.` });

    const results = [];
    for (const l of matches) {
      // Check if already in pipeline
      const { data: existing } = await sb
        .from("agency_leads")
        .select("id")
        .eq("organization_name", l.name)
        .maybeSingle();

      if (existing) {
        results.push({ name: l.name, status: "already in pipeline" });
        continue;
      }

      try {
        const { error: insertErr } = await sb.from("agency_leads").insert([{
          name: l.name,
          organization_name: l.name,
          email: l.email || "",
          phone: l.phone || "",
          city: l.city || "",
          website_url: l.website || "",
          source: "rex",
          stage: "new_lead",
          interest_level: null,
          treatments_offered: [],
          message: `Added via Rex. Category: ${l.category || ""}. Rating: ${l.rating || "N/A"}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }]);
        if (insertErr) {
          results.push({ name: l.name, status: "error: " + insertErr.message });
        } else {
          results.push({ name: l.name, status: "added to pipeline" });
        }
      } catch (e) {
        results.push({ name: l.name, status: "error: " + e.message });
      }
    }

    const added = results.filter(r => r.status === "added to pipeline").length;
    const dupes = results.filter(r => r.status === "already in pipeline").length;
    return JSON.stringify({ found: matches.length, added, alreadyInPipeline: dupes, details: results });
  },
});

// ─── Agent ───────────────────────────────────────────────────────────────────

export const rexAgent = new Agent({
  name: "Rex",
  instructions: `You are Rex 🔍, the Lead Scout for DentaFlow — a dental marketing agency platform.

Your job:
- Scrape Google Maps for dental practice leads using Apify or Google Places API
- Filter and deduplicate leads (must have name + email or phone)
- Save leads to Supabase rex_leads table
- Add specific leads to the main pipeline (agency_leads, new_lead stage)
- Export leads as CSV for outreach

When asked to search, always ask for:
1. Industry/search term (default: "dental clinic")
2. City or location

Summarize results clearly: total found, how many are new, how many were filtered out.

PIPELINE ACTIONS:
- If user says "add [name] to pipeline", "send [name] to Iris", "add this lead to pipeline" → call add_to_pipeline with the business name.
- After adding, confirm how many were added and mention they are now in new_lead stage in Dash.

If scraping fails due to missing API token, explain which env var to set (APIFY_API_TOKEN or GOOGLE_PLACES_API_KEY).`,
  tools: [searchLeadsTool, getLeadsTool, exportCsvTool, clearLeadsTool, getStatusTool, addToPipelineTool],
});
