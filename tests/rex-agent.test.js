// tests/rex-agent.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Hoist fs mocks ──────────────────────────────────────────────────────────
const { mockReadFile, mockWriteFile, mockMkdir } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn().mockResolvedValue(undefined),
  mockMkdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("fs/promises", () => ({
  default: { readFile: mockReadFile, writeFile: mockWriteFile, mkdir: mockMkdir },
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
}));

import {
  getLeads,
  clearLeads,
  exportLeadsCsv,
  searchLeads,
  getRexConfig,
} from "../lib/rex-agent.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setEnv(vars) {
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
}

function clearEnv() {
  ["APIFY_API_TOKEN", "GOOGLE_PLACES_API_KEY"].forEach((k) => delete process.env[k]);
}

function mockLeadsFile(leads = []) {
  mockReadFile.mockResolvedValue(JSON.stringify({ leads }));
}

const sampleLeads = [
  { name: "Bright Smile Dental", email: "info@brightsmile.com", phone: "+1234567890", city: "Houston", category: "dental clinic", source: "apify" },
  { name: "City Dentist", email: "contact@citydentist.com", phone: "+9876543210", city: "London", category: "dentist", source: "apify" },
  { name: "Kids Orthodontics", email: "hello@kidsortho.com", phone: "+1122334455", city: "Houston", category: "orthodontics", source: "google-places" },
];

// ─── getRexConfig — status ────────────────────────────────────────────────────

describe("getRexConfig", () => {
  beforeEach(clearEnv);
  afterEach(clearEnv);

  it("returns both disconnected when no env vars set", () => {
    const config = getRexConfig();
    expect(config.apifyConnected).toBe(false);
    expect(config.googlePlacesConnected).toBe(false);
  });

  it("returns apifyConnected=true when APIFY_API_TOKEN set", () => {
    setEnv({ APIFY_API_TOKEN: "test-token" });
    const config = getRexConfig();
    expect(config.apifyConnected).toBe(true);
    expect(config.googlePlacesConnected).toBe(false);
  });

  it("returns googlePlacesConnected=true when GOOGLE_PLACES_API_KEY set", () => {
    setEnv({ GOOGLE_PLACES_API_KEY: "places-key" });
    const config = getRexConfig();
    expect(config.apifyConnected).toBe(false);
    expect(config.googlePlacesConnected).toBe(true);
  });

  it("returns both connected when both keys set", () => {
    setEnv({ APIFY_API_TOKEN: "apify-key", GOOGLE_PLACES_API_KEY: "places-key" });
    const config = getRexConfig();
    expect(config.apifyConnected).toBe(true);
    expect(config.googlePlacesConnected).toBe(true);
  });

  it("always includes a feature description", () => {
    const config = getRexConfig();
    expect(config.feature).toBeDefined();
    expect(typeof config.feature).toBe("string");
  });
});

// ─── getLeads — read from file ────────────────────────────────────────────────

describe("getLeads — no filter", () => {
  beforeEach(() => mockReadFile.mockClear());

  it("returns all leads when no filter", async () => {
    mockLeadsFile(sampleLeads);
    const leads = await getLeads();
    expect(leads).toHaveLength(3);
  });

  it("returns empty array when file has no leads", async () => {
    mockLeadsFile([]);
    const leads = await getLeads();
    expect(leads).toHaveLength(0);
  });

  it("returns empty array when file has invalid JSON", async () => {
    mockReadFile.mockResolvedValue("not valid json {{");
    const leads = await getLeads();
    expect(leads).toHaveLength(0);
  });
});

describe("getLeads — city filter", () => {
  beforeEach(() => mockReadFile.mockClear());

  it("filters leads by city (case-insensitive)", async () => {
    mockLeadsFile(sampleLeads);
    const leads = await getLeads({ city: "houston" });
    expect(leads).toHaveLength(2);
    expect(leads.every((l) => l.city.toLowerCase() === "houston")).toBe(true);
  });

  it("returns empty when city does not match", async () => {
    mockLeadsFile(sampleLeads);
    const leads = await getLeads({ city: "Dubai" });
    expect(leads).toHaveLength(0);
  });
});

describe("getLeads — industry filter", () => {
  beforeEach(() => mockReadFile.mockClear());

  it("filters leads by industry keyword in category", async () => {
    mockLeadsFile(sampleLeads);
    const leads = await getLeads({ industry: "dental" });
    // "dental clinic" and "dentist" both contain "dental" or match
    expect(leads.length).toBeGreaterThan(0);
  });

  it("filters leads by industry keyword in name", async () => {
    mockLeadsFile(sampleLeads);
    const leads = await getLeads({ industry: "orthodontics" });
    expect(leads).toHaveLength(1);
    expect(leads[0].name).toBe("Kids Orthodontics");
  });

  it("returns empty when industry does not match", async () => {
    mockLeadsFile(sampleLeads);
    const leads = await getLeads({ industry: "plumbing" });
    expect(leads).toHaveLength(0);
  });
});

describe("getLeads — combined filter", () => {
  beforeEach(() => mockReadFile.mockClear());

  it("filters by both city and industry", async () => {
    mockLeadsFile(sampleLeads);
    const leads = await getLeads({ city: "houston", industry: "dental" });
    expect(leads).toHaveLength(1);
    expect(leads[0].name).toBe("Bright Smile Dental");
  });
});

// ─── clearLeads ───────────────────────────────────────────────────────────────

describe("clearLeads", () => {
  beforeEach(() => {
    mockReadFile.mockClear();
    mockWriteFile.mockClear();
    mockMkdir.mockClear();
  });

  it("returns { cleared: true }", async () => {
    const result = await clearLeads();
    expect(result).toEqual({ cleared: true });
  });

  it("writes empty leads array to file", async () => {
    await clearLeads();
    expect(mockWriteFile).toHaveBeenCalledOnce();
    const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
    expect(written).toEqual({ leads: [] });
  });
});

// ─── exportLeadsCsv ───────────────────────────────────────────────────────────

describe("exportLeadsCsv — empty", () => {
  beforeEach(() => mockReadFile.mockClear());

  it("returns empty string when no leads saved", async () => {
    mockLeadsFile([]);
    const csv = await exportLeadsCsv();
    expect(csv).toBe("");
  });

  it("returns empty string when file has invalid JSON", async () => {
    mockReadFile.mockResolvedValue("not valid json {{");
    const csv = await exportLeadsCsv();
    expect(csv).toBe("");
  });
});

describe("exportLeadsCsv — with data", () => {
  beforeEach(() => mockReadFile.mockClear());

  it("returns a CSV string with header row", async () => {
    mockLeadsFile(sampleLeads);
    const csv = await exportLeadsCsv();
    expect(csv).toContain("name,email,phone");
  });

  it("contains lead data in CSV output", async () => {
    mockLeadsFile(sampleLeads);
    const csv = await exportLeadsCsv();
    expect(csv).toContain("Bright Smile Dental");
    expect(csv).toContain("info@brightsmile.com");
  });

  it("has correct number of rows (header + N leads)", async () => {
    mockLeadsFile(sampleLeads);
    const csv = await exportLeadsCsv();
    const rows = csv.trim().split("\n");
    expect(rows).toHaveLength(sampleLeads.length + 1); // +1 for header
  });

  it("escapes double quotes in values", async () => {
    mockLeadsFile([{ name: 'Say "hello"', email: "test@test.com", phone: "", city: "", website: "", rating: null, category: "", source: "" }]);
    const csv = await exportLeadsCsv();
    expect(csv).toContain('Say ""hello""');
  });
});

// ─── searchLeads — validation ────────────────────────────────────────────────

describe("searchLeads — no API keys configured", () => {
  beforeEach(() => {
    clearEnv();
    mockReadFile.mockClear();
    mockReadFile.mockRejectedValue(new Error("ENOENT")); // no existing file
  });
  afterEach(clearEnv);

  it("throws when no scraping source is configured", async () => {
    await expect(searchLeads({ query: "dentist" })).rejects.toThrow(
      "No scraping source configured"
    );
  });

  it("error message mentions env vars to set", async () => {
    await expect(searchLeads({ query: "dentist" })).rejects.toThrow(
      "APIFY_API_TOKEN"
    );
  });
});
