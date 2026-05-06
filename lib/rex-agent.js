import fs from "fs/promises";
import path from "path";

const LEADS_FILE = path.join(process.cwd(), "data", "rex-leads.json");

async function readLeads() {
  try {
    const raw = await fs.readFile(LEADS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { leads: [] };
  }
}

async function writeLeads(data) {
  await fs.mkdir(path.dirname(LEADS_FILE), { recursive: true });
  await fs.writeFile(LEADS_FILE, JSON.stringify(data, null, 2));
}

function normalizeEmail(str) {
  return (str || "").toLowerCase().trim();
}

function dedupeLeads(existing, incoming) {
  const seen = new Set(existing.map((l) => normalizeEmail(l.email) || l.phone || l.name));
  return incoming.filter((l) => {
    const key = normalizeEmail(l.email) || l.phone || l.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Email enrichment: visit website, find contact email ─────────────────────

async function extractEmailsFromWebsite(websiteUrl) {
  if (!websiteUrl) return null;
  try {
    const base = websiteUrl.replace(/\/$/, "");
    const pagesToTry = [base, `${base}/contact`, `${base}/contact-us`, `${base}/about`];

    for (const url of pagesToTry) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(8000),
          headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadScout/1.0)" },
        });
        if (!res.ok) continue;
        const html = await res.text();
        const emails = [...html.matchAll(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g)]
          .map((m) => m[0].toLowerCase())
          .filter((e) => !e.endsWith(".png") && !e.endsWith(".jpg") && !e.includes("example.com") && !e.includes("sentry.io"));
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

async function scrapeViaApify(query, maxResults = 50) {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN missing in .env");

  const runRes = await fetch(
    `https://api.apify.com/v2/acts/compass~crawler-google-places/runs?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchStringsArray: [query],
        maxCrawledPlacesPerSearch: maxResults,
        language: "en",
        includeWebResults: false,
      }),
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
    await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`).then((r) => r.json())
  ).data.defaultDatasetId;

  const itemsRes = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&format=json&limit=${maxResults}`
  );
  const items = await itemsRes.json();
  return items;
}

function apifyItemToLead(item) {
  return {
    id: item.placeId || `rex-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: item.title || "",
    address: item.address || "",
    city: item.city || "",
    phone: item.phone || item.phoneUnformatted || "",
    website: item.website || "",
    rating: item.totalScore || null,
    reviewsCount: item.reviewsCount || 0,
    category: item.categoryName || "",
    email: null,
    source: "apify",
    scrapedAt: new Date().toISOString(),
  };
}

// ─── Google Places fallback ───────────────────────────────────────────────────

async function scrapeViaGooglePlaces(query, maxResults = 50) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY missing in .env (needed as Apify fallback)");

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
        reviewsCount: place.user_ratings_total || 0,
        category: (place.types || []).join(", "),
        email: null,
        source: "google-places",
        scrapedAt: new Date().toISOString(),
      });
      if (results.length >= maxResults) break;
    }

    pageToken = json.next_page_token || null;
    if (!pageToken) break;
    await new Promise((r) => setTimeout(r, 2100));
  }

  // Enrich with Place Details to get website + phone
  const enriched = [];
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
    enriched.push(place);
  }

  return enriched;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function searchLeads({ query, city, maxResults = 50 }) {
  const fullQuery = city ? `${query} in ${city}` : query;
  let rawLeads = [];
  let usedSource = "apify";

  const apifyToken = process.env.APIFY_API_TOKEN;
  const placesKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!apifyToken && !placesKey) {
    throw new Error(
      "No scraping source configured. Add APIFY_API_TOKEN or GOOGLE_PLACES_API_KEY to your .env file."
    );
  }

  if (apifyToken) {
    try {
      const items = await scrapeViaApify(fullQuery, maxResults);
      rawLeads = items.map(apifyItemToLead);
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
        rawLeads = await scrapeViaGooglePlaces(fullQuery, maxResults);
      } else {
        // Auth error or other Apify failure — surface it clearly
        throw new Error(
          `Apify scraping failed: ${apifyErr.message}\n\n` +
          `Fix: Go to https://console.apify.com/account/integrations and copy your Personal API Token, then update APIFY_API_TOKEN in .env`
        );
      }
    }
  } else {
    // No Apify token — use Google Places directly
    usedSource = "google-places";
    rawLeads = await scrapeViaGooglePlaces(fullQuery, maxResults);
  }

  // Email enrichment
  const enriched = [];
  for (const lead of rawLeads) {
    if (lead.website) {
      lead.email = await extractEmailsFromWebsite(lead.website);
    }
    const hasMinData = lead.name && (lead.email || lead.phone);
    if (hasMinData) enriched.push(lead);
  }

  const { leads: existing } = await readLeads();
  const newLeads = dedupeLeads(existing, enriched);
  const allLeads = [...existing, ...newLeads];
  await writeLeads({ leads: allLeads });

  return {
    query: fullQuery,
    source: usedSource,
    totalFound: rawLeads.length,
    newLeads: newLeads.length,
    filtered: rawLeads.length - enriched.length,
    leads: newLeads,
  };
}

export async function getLeads({ industry, city } = {}) {
  const { leads } = await readLeads();
  let filtered = leads;
  if (industry) {
    const q = industry.toLowerCase();
    filtered = filtered.filter(
      (l) =>
        (l.category || "").toLowerCase().includes(q) ||
        (l.name || "").toLowerCase().includes(q)
    );
  }
  if (city) {
    const q = city.toLowerCase();
    filtered = filtered.filter((l) => (l.city || "").toLowerCase().includes(q));
  }
  return filtered;
}

export async function clearLeads() {
  await writeLeads({ leads: [] });
  return { cleared: true };
}

export async function exportLeadsCsv() {
  const { leads } = await readLeads();
  if (!leads.length) return "";
  const headers = ["name", "email", "phone", "address", "city", "website", "rating", "category", "source"];
  const rows = leads.map((l) =>
    headers.map((h) => `"${String(l[h] || "").replace(/"/g, '""')}"`).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}
