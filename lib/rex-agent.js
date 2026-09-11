import { getSupabase } from "./supabase.js";

// ─── Email enrichment: visit website, find contact email ─────────────────────

async function extractEmailsFromWebsite(websiteUrl) {
  if (!websiteUrl) return null;
  try {
    const base = websiteUrl.replace(/\/$/, "");
    const pagesToTry = [base, `${base}/contact`, `${base}/contact-us`, `${base}/about`];

    for (const url of pagesToTry) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(6000),
          headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadScout/1.0)" },
        });
        if (!res.ok) continue;
        const html = await res.text();
        const emails = [...html.matchAll(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g)]
          .map((m) => m[0].toLowerCase())
          .filter(
            (e) =>
              !e.endsWith(".png") &&
              !e.endsWith(".jpg") &&
              !e.includes("example.com") &&
              !e.includes("sentry.io") &&
              !e.includes("wixpress") &&
              !e.includes("squarespace")
          );
        if (emails.length) return emails[0];
      } catch {
        // try next page
      }
    }
  } catch {
    // enrichment best-effort
  }
  return null;
}

// ─── Apify Google Maps scraper ────────────────────────────────────────────────

async function scrapeViaApify(query, maxResults = 50, city = "") {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN missing in .env");

  const body = {
    searchStringsArray: [query],
    maxCrawledPlacesPerSearch: maxResults,
    language: "en",
    includeWebResults: false,
  };
  // Pass city as separate locationQuery so Apify pins the map to that area
  if (city) body.locationQuery = city;

  const runRes = await fetch(
    `https://api.apify.com/v2/acts/compass~crawler-google-places/runs?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!runRes.ok) {
    const txt = await runRes.text().catch(() => "");
    throw new Error(`Apify run failed: ${runRes.status} ${txt}`);
  }

  const { data: run } = await runRes.json();
  const runId = run.id;

  // Poll until finished (max 3 minutes)
  const startedAt = Date.now();
  while (Date.now() - startedAt < 180000) {
    await new Promise((r) => setTimeout(r, 4000));
    const statusRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`
    );
    const { data: status } = await statusRes.json();
    if (status.status === "SUCCEEDED") break;
    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status.status)) {
      throw new Error(`Apify run ${status.status}`);
    }
  }

  const datasetId = (
    await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`).then((r) =>
      r.json()
    )
  ).data.defaultDatasetId;

  const itemsRes = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&format=json&limit=${maxResults}`
  );
  const items = await itemsRes.json();
  return items;
}

function apifyItemToLead(item, industry = "") {
  return {
    id: item.placeId || `rex-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: item.title || "",
    address: item.address || "",
    city: item.city || (item.address || "").split(",").slice(-2, -1)[0]?.trim() || "",
    phone: item.phone || item.phoneUnformatted || "",
    website: item.website || "",
    rating: item.totalScore || null,
    category: item.categoryName || "",
    email: null,
    industry: industry || "",
    source: "apify",
    scraped_at: new Date().toISOString(),
  };
}

// ─── Google Places fallback ───────────────────────────────────────────────────

async function scrapeViaGooglePlaces(query, maxResults = 50, industry = "") {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY missing in .env");

  const results = [];
  let pageToken = null;

  while (results.length < maxResults) {
    const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
    url.searchParams.set("query", query);
    url.searchParams.set("key", key);
    if (pageToken) url.searchParams.set("pagetoken", pageToken);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Google Places API error: ${res.status}`);
    const json = await res.json();
    if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
      throw new Error(`Google Places: ${json.status} — ${json.error_message || ""}`);
    }

    for (const place of json.results || []) {
      results.push({
        id: place.place_id,
        name: place.name || "",
        address: place.formatted_address || "",
        city: (place.formatted_address || "").split(",").slice(-2, -1)[0]?.trim() || "",
        phone: "",
        website: "",
        rating: place.rating || null,
        category: (place.types || []).join(", "),
        email: null,
        industry: industry || "",
        source: "google-places",
        scraped_at: new Date().toISOString(),
      });
      if (results.length >= maxResults) break;
    }

    pageToken = json.next_page_token || null;
    if (!pageToken) break;
    await new Promise((r) => setTimeout(r, 2100));
  }

  // Enrich with Place Details
  for (const place of results) {
    try {
      const detailUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
      detailUrl.searchParams.set("place_id", place.id);
      detailUrl.searchParams.set("fields", "website,formatted_phone_number");
      detailUrl.searchParams.set("key", key);
      const detailRes = await fetch(detailUrl.toString());
      const detail = await detailRes.json();
      place.website = detail.result?.website || "";
      place.phone = detail.result?.formatted_phone_number || "";
    } catch {
      // best effort
    }
  }

  return results;
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function getExistingIds() {
  const sb = getSupabase();
  if (!sb) return new Set();
  const { data } = await sb.from("rex_leads").select("id");
  return new Set((data || []).map((r) => r.id));
}

async function saveLeadsToSupabase(leads) {
  const sb = getSupabase();
  if (!sb || !leads.length) return 0;

  // upsert — id is the conflict key
  const rows = leads.map((l) => ({
    id: l.id,
    name: l.name || "",
    email: l.email || null,
    phone: l.phone || null,
    address: l.address || null,
    city: l.city || null,
    website: l.website || null,
    rating: l.rating ? Number(l.rating) : null,
    category: l.category || null,
    industry: l.industry || null,
    source: l.source || "apify",
    scraped_at: l.scraped_at || new Date().toISOString(),
  }));

  const { error } = await sb.from("rex_leads").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`Supabase save error: ${error.message}`);
  return rows.length;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function searchLeads({ query, city, maxResults = 50, industry = "" }) {
  const fullQuery = city ? `${query} in ${city}` : query;
  const detectedIndustry = industry || query;
  let rawLeads = [];
  let usedSource = "apify";

  const apifyToken = process.env.APIFY_API_TOKEN;
  const placesKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!apifyToken && !placesKey) {
    throw new Error(
      "No scraping source configured. Add APIFY_API_TOKEN or GOOGLE_PLACES_API_KEY to .env"
    );
  }

  if (apifyToken) {
    try {
      const items = await scrapeViaApify(query, maxResults, city);
      rawLeads = items.map((item) => apifyItemToLead(item, detectedIndustry));
    } catch (apifyErr) {
      const msg = (apifyErr.message || "").toLowerCase();
      const isExhausted =
        msg.includes("insufficient") ||
        msg.includes("credit") ||
        msg.includes("quota") ||
        msg.includes("payment") ||
        msg.includes("upgrade");

      if (isExhausted && placesKey) {
        console.warn("⚠️ Apify credits exhausted — falling back to Google Places API");
        usedSource = "google-places";
        rawLeads = await scrapeViaGooglePlaces(fullQuery, maxResults, detectedIndustry);
      } else {
        throw new Error(
          `Apify scraping failed: ${apifyErr.message}\n\nFix: Go to https://console.apify.com/account/integrations and copy your Personal API Token, then update APIFY_API_TOKEN in .env`
        );
      }
    }
  } else {
    usedSource = "google-places";
    rawLeads = await scrapeViaGooglePlaces(fullQuery, maxResults, detectedIndustry);
  }

  // Email enrichment (best-effort, don't filter out leads without email)
  for (const lead of rawLeads) {
    if (lead.website && !lead.email) {
      lead.email = await extractEmailsFromWebsite(lead.website);
    }
  }

  // Filter: must have a name
  let validLeads = rawLeads.filter((l) => l.name?.trim());

  // Post-filter by city: if a city was specified, drop leads that don't match it
  if (city) {
    const cityNorm = city.toLowerCase().replace(/,.*/, "").trim(); // "austin" from "austin, tx"
    validLeads = validLeads.filter((l) => {
      const haystack = `${l.city || ""} ${l.address || ""}`.toLowerCase();
      return haystack.includes(cityNorm);
    });
  }

  // Deduplicate against Supabase (check existing IDs)
  const existingIds = await getExistingIds();
  const newLeads = validLeads.filter((l) => !existingIds.has(l.id));

  // Save new leads to Supabase
  let savedCount = 0;
  if (newLeads.length) {
    savedCount = await saveLeadsToSupabase(newLeads);
  }

  return {
    query: fullQuery,
    source: usedSource,
    totalFound: rawLeads.length,
    newLeads: savedCount,
    filtered: rawLeads.length - validLeads.length,
    duplicates: validLeads.length - newLeads.length,
    leads: newLeads, // newly added leads
    allLeads: validLeads, // all found this run (including duplicates)
  };
}

export async function getLeads({ industry, city } = {}) {
  const sb = getSupabase();
  if (!sb) return [];

  let query = sb.from("rex_leads").select("*").order("scraped_at", { ascending: false });

  if (industry) {
    query = query.or(
      `category.ilike.%${industry}%,name.ilike.%${industry}%,industry.ilike.%${industry}%`
    );
  }
  if (city) {
    query = query.ilike("city", `%${city}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`getLeads error: ${error.message}`);
  return data || [];
}

export async function clearLeads() {
  const sb = getSupabase();
  if (!sb) return { cleared: true };
  await sb.from("rex_leads").delete().neq("id", "");
  return { cleared: true };
}

export async function exportLeadsCsv({ industry, city } = {}) {
  const leads = await getLeads({ industry, city });
  if (!leads.length) return "";
  const headers = ["name", "email", "phone", "address", "city", "website", "rating", "category", "industry", "source"];
  const rows = leads.map((l) =>
    headers.map((h) => `"${String(l[h] || "").replace(/"/g, '""')}"`).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

// ─── Config / Status ──────────────────────────────────────────────────────────

export function getRexConfig() {
  return {
    apifyConnected: Boolean(process.env.APIFY_API_TOKEN),
    googlePlacesConnected: Boolean(process.env.GOOGLE_PLACES_API_KEY),
    feature: "Google Maps lead scraping via Apify (falls back to Google Places API)",
  };
}
