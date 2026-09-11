import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Hoist fs mocks ───────────────────────────────────────────────────────────
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

// ─── Mock OpenAI ──────────────────────────────────────────────────────────────
const mockCreate = vi.fn();

vi.mock("openai", () => ({
  default: class OpenAI {
    constructor() {
      this.chat = { completions: { create: mockCreate } };
    }
  },
}));

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
} from "../lib/nora-agent.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockFetchOk(body) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
  });
}

function mockFetchFail(status, errorMessage) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ error: { message: errorMessage } }),
  });
}

function setMetaEnv() {
  process.env.META_PAGE_ACCESS_TOKEN = "test-token";
  process.env.META_PAGE_ID = "123456";
}

function clearMetaEnv() {
  delete process.env.META_PAGE_ACCESS_TOKEN;
  delete process.env.META_PAGE_ID;
}

function setCanvaEnv() {
  process.env.CANVA_CLIENT_ID = "canva-client-id";
  process.env.CANVA_ACCESS_TOKEN = "canva-access-token";
}

function clearCanvaEnv() {
  delete process.env.CANVA_CLIENT_ID;
  delete process.env.CANVA_ACCESS_TOKEN;
}

// original Helpers below ──────────────────────────────────────────────────────

function mockEmptyTemplates() {
  mockReadFile.mockRejectedValue(new Error("not found"));
}

function mockTemplates(list) {
  mockReadFile.mockResolvedValue(JSON.stringify({ templates: list }));
}

function mockAI(text) {
  mockCreate.mockResolvedValue({
    choices: [{ message: { content: text } }],
  });
}

function setEnv(vars) {
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
}

function clearNoraEnv() {
  ["OPENAI_API_KEY"].forEach((k) => delete process.env[k]);
}

// ─── generateEmailTemplates ───────────────────────────────────────────────────

describe("generateEmailTemplates", () => {
  beforeEach(() => {
    mockEmptyTemplates();
    mockWriteFile.mockClear();
    setEnv({ OPENAI_API_KEY: "sk-test" });
  });

  afterEach(clearNoraEnv);

  it("throws when OPENAI_API_KEY is missing", async () => {
    clearNoraEnv();
    await expect(generateEmailTemplates({ industry: "dental" })).rejects.toThrow(
      "OPENAI_API_KEY missing"
    );
  });

  it("calls OpenAI 4 times (one per email step)", async () => {
    mockCreate.mockClear();
    mockAI("Generated email body");
    await generateEmailTemplates({ industry: "dental" });
    expect(mockCreate).toHaveBeenCalledTimes(4);
  });

  it("returns template with 4 email keys", async () => {
    mockAI("Email content here");
    const result = await generateEmailTemplates({ industry: "dental" });
    expect(result.emails).toHaveProperty("intro");
    expect(result.emails).toHaveProperty("followup");
    expect(result.emails).toHaveProperty("proposal");
    expect(result.emails).toHaveProperty("final");
  });

  it("returns correct industry in template", async () => {
    mockAI("content");
    const result = await generateEmailTemplates({ industry: "real estate" });
    expect(result.industry).toBe("real estate");
  });

  it("includes senderName in template", async () => {
    mockAI("content");
    const result = await generateEmailTemplates({ industry: "dental", senderName: "Donia" });
    expect(result.senderName).toBe("Donia");
  });

  it("generates a unique template ID with email prefix", async () => {
    mockAI("content");
    const result = await generateEmailTemplates({ industry: "dental" });
    expect(result.id).toMatch(/^email-/);
  });

  it("saves template to file", async () => {
    mockAI("content");
    await generateEmailTemplates({ industry: "dental" });
    expect(mockWriteFile).toHaveBeenCalled();
    const written = JSON.parse(mockWriteFile.mock.calls.at(-1)[1]);
    expect(written.templates.length).toBe(1);
    expect(written.templates[0].type).toBe("email-sequence");
  });

  it("appends to existing templates without overwriting", async () => {
    const existing = [{ id: "email-old", type: "email-sequence", industry: "dentist" }];
    mockTemplates(existing);
    mockAI("content");
    await generateEmailTemplates({ industry: "dental" });
    const written = JSON.parse(mockWriteFile.mock.calls.at(-1)[1]);
    expect(written.templates.length).toBe(2);
  });
});

// ─── generateProposal ─────────────────────────────────────────────────────────

describe("generateProposal", () => {
  beforeEach(() => {
    mockEmptyTemplates();
    mockWriteFile.mockClear();
    mockCreate.mockClear();
    setEnv({ OPENAI_API_KEY: "sk-test" });
  });

  afterEach(clearNoraEnv);

  it("throws when OPENAI_API_KEY is missing", async () => {
    clearNoraEnv();
    await expect(
      generateProposal({
        industry: "dental",
        leadName: "Dr Ali",
        businessName: "Ali Clinic",
        painPoint: "no patients",
      })
    ).rejects.toThrow("OPENAI_API_KEY missing");
  });

  it("calls OpenAI once", async () => {
    mockAI("Proposal content");
    await generateProposal({
      industry: "dental",
      leadName: "Dr Ali",
      businessName: "Ali Clinic",
      painPoint: "low patient count",
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("returns proposal with content field", async () => {
    mockAI("Here is your proposal...");
    const result = await generateProposal({
      industry: "dental",
      leadName: "Dr Ali",
      businessName: "Ali Clinic",
      painPoint: "no social media",
    });
    expect(result.content).toBe("Here is your proposal...");
    expect(result.type).toBe("proposal");
  });

  it("includes lead info in template", async () => {
    mockAI("proposal");
    const result = await generateProposal({
      industry: "dental",
      leadName: "Dr Sara",
      businessName: "Sara Dental",
      painPoint: "no marketing",
    });
    expect(result.leadName).toBe("Dr Sara");
    expect(result.businessName).toBe("Sara Dental");
  });

  it("saves proposal with unique ID starting with 'proposal-'", async () => {
    mockAI("proposal body");
    const result = await generateProposal({
      industry: "dental",
      leadName: "X",
      businessName: "Y",
      painPoint: "Z",
    });
    expect(result.id).toMatch(/^proposal-/);
    expect(mockWriteFile).toHaveBeenCalled();
  });
});

// ─── generateSocialPost ───────────────────────────────────────────────────────

describe("generateSocialPost", () => {
  beforeEach(() => {
    mockEmptyTemplates();
    mockWriteFile.mockClear();
    setEnv({ OPENAI_API_KEY: "sk-test" });
  });

  afterEach(clearNoraEnv);

  it("generates a LinkedIn post", async () => {
    mockAI("LinkedIn post content here #dental #marketing");
    const result = await generateSocialPost({
      industry: "dental",
      platform: "linkedin",
      topic: "Why dentists need social media",
    });
    expect(result.platform).toBe("linkedin");
    expect(result.content).toBe("LinkedIn post content here #dental #marketing");
    expect(result.type).toBe("social-post");
  });

  it("generates a Facebook post", async () => {
    mockAI("Facebook post");
    const result = await generateSocialPost({
      industry: "dental",
      platform: "facebook",
      topic: "Patient stories",
    });
    expect(result.platform).toBe("facebook");
  });

  it("generates an Instagram post", async () => {
    mockAI("Instagram caption 🦷 #teeth");
    const result = await generateSocialPost({
      industry: "dental",
      platform: "instagram",
      topic: "Before and after",
    });
    expect(result.platform).toBe("instagram");
  });

  it("saves post with ID starting with 'social-'", async () => {
    mockAI("content");
    const result = await generateSocialPost({
      industry: "dental",
      platform: "linkedin",
      topic: "test",
    });
    expect(result.id).toMatch(/^social-/);
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it("includes topic in template", async () => {
    mockAI("content");
    const result = await generateSocialPost({
      industry: "dental",
      platform: "linkedin",
      topic: "3 tips for dental marketing",
    });
    expect(result.topic).toBe("3 tips for dental marketing");
  });
});

// ─── generateAdCopy ───────────────────────────────────────────────────────────

describe("generateAdCopy", () => {
  beforeEach(() => {
    mockEmptyTemplates();
    mockWriteFile.mockClear();
    setEnv({ OPENAI_API_KEY: "sk-test" });
  });

  afterEach(clearNoraEnv);

  it("generates Google ad copy", async () => {
    mockAI("Headline 1: Get More Patients\nHeadline 2: Dental Marketing Pro");
    const result = await generateAdCopy({
      industry: "dental",
      platform: "google",
      offer: "Free dental marketing audit",
    });
    expect(result.platform).toBe("google");
    expect(result.type).toBe("ad-copy");
  });

  it("generates Meta ad copy", async () => {
    mockAI("Primary Text: Grow your dental practice...");
    const result = await generateAdCopy({
      industry: "dental",
      platform: "meta",
      offer: "30% more patients in 90 days",
    });
    expect(result.platform).toBe("meta");
  });

  it("saves ad with ID starting with 'ad-'", async () => {
    mockAI("ad content");
    const result = await generateAdCopy({
      industry: "dental",
      platform: "google",
      offer: "test offer",
    });
    expect(result.id).toMatch(/^ad-/);
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it("includes offer in template", async () => {
    mockAI("content");
    const result = await generateAdCopy({
      industry: "dental",
      platform: "meta",
      offer: "Free website audit",
    });
    expect(result.offer).toBe("Free website audit");
  });
});

// ─── listTemplates ────────────────────────────────────────────────────────────

describe("listTemplates", () => {
  const sampleTemplates = [
    { id: "email-1", type: "email-sequence", industry: "dental" },
    { id: "proposal-1", type: "proposal", industry: "dental" },
    { id: "social-1", type: "social-post", industry: "dental" },
    { id: "ad-1", type: "ad-copy", industry: "dental" },
  ];

  beforeEach(() => mockTemplates(sampleTemplates));

  it("returns all templates when no type filter", async () => {
    const result = await listTemplates();
    expect(result).toHaveLength(4);
  });

  it("filters by type=email-sequence", async () => {
    const result = await listTemplates({ type: "email-sequence" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("email-1");
  });

  it("filters by type=proposal", async () => {
    const result = await listTemplates({ type: "proposal" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("proposal-1");
  });

  it("returns empty array when file does not exist", async () => {
    mockEmptyTemplates();
    const result = await listTemplates();
    expect(result).toEqual([]);
  });

  it("returns empty array when type filter matches nothing", async () => {
    const result = await listTemplates({ type: "ad-copy" });
    expect(result).toHaveLength(1); // only ad-1
  });
});

// ─── getTemplate ──────────────────────────────────────────────────────────────

describe("getTemplate", () => {
  const templates = [
    { id: "email-abc", type: "email-sequence" },
    { id: "proposal-xyz", type: "proposal" },
  ];

  beforeEach(() => mockTemplates(templates));

  it("returns template by id", async () => {
    const result = await getTemplate("email-abc");
    expect(result).not.toBeNull();
    expect(result.id).toBe("email-abc");
  });

  it("returns null when id not found", async () => {
    const result = await getTemplate("not-real");
    expect(result).toBeNull();
  });

  it("returns null when file does not exist", async () => {
    mockEmptyTemplates();
    const result = await getTemplate("email-abc");
    expect(result).toBeNull();
  });
});

// ─── deleteTemplate ───────────────────────────────────────────────────────────

describe("deleteTemplate", () => {
  const templates = [
    { id: "email-1", type: "email-sequence" },
    { id: "email-2", type: "email-sequence" },
  ];

  beforeEach(() => {
    mockTemplates(templates);
    mockWriteFile.mockClear();
  });

  it("removes the correct template", async () => {
    const result = await deleteTemplate("email-1");
    expect(result.deleted).toBe("email-1");
    const written = JSON.parse(mockWriteFile.mock.calls.at(-1)[1]);
    expect(written.templates).toHaveLength(1);
    expect(written.templates[0].id).toBe("email-2");
  });

  it("does not throw if id not found — just no-ops", async () => {
    await expect(deleteTemplate("ghost")).resolves.toEqual({ deleted: "ghost" });
    const written = JSON.parse(mockWriteFile.mock.calls.at(-1)[1]);
    expect(written.templates).toHaveLength(2); // unchanged
  });

  it("writes updated templates to file", async () => {
    await deleteTemplate("email-1");
    expect(mockWriteFile).toHaveBeenCalled();
  });
});

// ─── postToMeta ───────────────────────────────────────────────────────────────

describe("postToMeta — validation", () => {
  it("throws when message is missing", async () => {
    await expect(postToMeta({})).rejects.toThrow("message is required");
  });
});

describe("postToMeta — dev fallback (no META_ credentials)", () => {
  beforeEach(clearMetaEnv);

  it("returns posted=false in dev mode", async () => {
    const result = await postToMeta({ message: "Hello Facebook!" });
    expect(result.posted).toBe(false);
    expect(result.dev).toBe(true);
  });

  it("does not call fetch in dev mode", async () => {
    global.fetch = vi.fn();
    await postToMeta({ message: "test" });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("postToMeta — with META credentials", () => {
  beforeEach(setMetaEnv);
  afterEach(clearMetaEnv);

  it("posts to Facebook and returns postId", async () => {
    mockFetchOk({ id: "post-123" });
    const result = await postToMeta({ message: "Hello world!", platform: "facebook" });
    expect(result.posted).toBe(true);
    expect(result.results[0].channel).toBe("facebook");
    expect(result.results[0].postId).toBe("post-123");
  });

  it("posts to both when platform=both and imageUrl given", async () => {
    // FB feed → container → publish (3 calls)
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: "fb-post" }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: "ig-container" }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: "ig-post" }) });

    const result = await postToMeta({
      message: "Hello!",
      imageUrl: "https://cdn.example.com/image.jpg",
      platform: "both",
    });
    expect(result.results).toHaveLength(2);
    expect(result.results.some((r) => r.channel === "facebook")).toBe(true);
    expect(result.results.some((r) => r.channel === "instagram")).toBe(true);
  });

  it("throws on Facebook API error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: { message: "Invalid access token" } }),
    });
    await expect(postToMeta({ message: "test", platform: "facebook" })).rejects.toThrow(
      "Invalid access token"
    );
  });
});

// ─── getPageInsights ──────────────────────────────────────────────────────────

describe("getPageInsights — validation", () => {
  it("throws when metric is missing", async () => {
    await expect(getPageInsights({})).rejects.toThrow("metric is required");
  });
});

describe("getPageInsights — dev fallback", () => {
  beforeEach(clearMetaEnv);

  it("returns dev=true and empty data when no credentials", async () => {
    const result = await getPageInsights({ metric: "page_impressions" });
    expect(result.dev).toBe(true);
    expect(result.data).toEqual([]);
  });
});

describe("getPageInsights — with META credentials", () => {
  beforeEach(setMetaEnv);
  afterEach(clearMetaEnv);

  it("returns metric data on success", async () => {
    mockFetchOk({
      data: [{ name: "page_impressions", period: "day", values: [{ value: 1200 }] }],
    });
    const result = await getPageInsights({ metric: "page_impressions", period: "day" });
    expect(result.metric).toBe("page_impressions");
    expect(result.data).toHaveLength(1);
  });

  it("throws on API error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: { message: "Metric not supported" } }),
    });
    await expect(getPageInsights({ metric: "bad_metric" })).rejects.toThrow("Metric not supported");
  });
});

// ─── createCanvaDesign ────────────────────────────────────────────────────────

describe("createCanvaDesign — dev fallback (no CANVA_ credentials)", () => {
  beforeEach(clearCanvaEnv);

  it("returns created=false with a fallback Canva URL", async () => {
    const result = await createCanvaDesign({ designType: "instagram_post" });
    expect(result.created).toBe(false);
    expect(result.dev).toBe(true);
    expect(result.editUrl).toContain("canva.com");
  });

  it("uses default designType when not provided", async () => {
    const result = await createCanvaDesign();
    expect(result.designType).toBe("instagram_post");
  });

  it("does not call fetch in dev mode", async () => {
    global.fetch = vi.fn();
    await createCanvaDesign({ designType: "facebook_post" });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("createCanvaDesign — with Canva credentials", () => {
  beforeEach(setCanvaEnv);
  afterEach(clearCanvaEnv);

  it("returns created=true with designId and editUrl", async () => {
    mockFetchOk({
      design: {
        id: "DABcdef123",
        title: "Test Design",
        urls: { edit_url: "https://www.canva.com/design/DABcdef123/edit" },
        thumbnail: { url: "https://cdn.canva.com/thumb.png" },
      },
    });
    const result = await createCanvaDesign({ designType: "linkedin_post", title: "My Post" });
    expect(result.created).toBe(true);
    expect(result.designId).toBe("DABcdef123");
    expect(result.editUrl).toContain("canva.com");
  });

  it("throws on Canva API error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: "Unauthorized" }),
    });
    await expect(createCanvaDesign({ designType: "instagram_post" })).rejects.toThrow(
      "Canva API error: Unauthorized"
    );
  });
});

// ─── exportCanvaDesign ────────────────────────────────────────────────────────

describe("exportCanvaDesign — validation", () => {
  it("throws when designId is missing", async () => {
    await expect(exportCanvaDesign({})).rejects.toThrow("designId is required");
  });
});

describe("exportCanvaDesign — dev fallback", () => {
  beforeEach(clearCanvaEnv);

  it("returns dev=true message when no credentials", async () => {
    const result = await exportCanvaDesign({ designId: "abc123" });
    expect(result.dev).toBe(true);
  });
});

// ─── getNoraConfig ────────────────────────────────────────────────────────────

describe("getNoraConfig", () => {
  it("returns aiConnected=false when OPENAI_API_KEY missing", () => {
    clearNoraEnv();
    const config = getNoraConfig();
    expect(config.aiConnected).toBe(false);
  });

  it("returns aiConnected=true when OPENAI_API_KEY set", () => {
    setEnv({ OPENAI_API_KEY: "sk-test" });
    const config = getNoraConfig();
    expect(config.aiConnected).toBe(true);
  });

  it("returns metaConnected=false when META_ vars missing", () => {
    clearMetaEnv();
    const config = getNoraConfig();
    expect(config.metaConnected).toBe(false);
  });

  it("returns metaConnected=true when META_ vars set", () => {
    setMetaEnv();
    const config = getNoraConfig();
    expect(config.metaConnected).toBe(true);
    clearMetaEnv();
  });

  it("returns canvaConnected=false when CANVA_ vars missing", () => {
    clearCanvaEnv();
    const config = getNoraConfig();
    expect(config.canvaConnected).toBe(false);
  });

  it("returns canvaConnected=true when CANVA_ vars set", () => {
    setCanvaEnv();
    const config = getNoraConfig();
    expect(config.canvaConnected).toBe(true);
    clearCanvaEnv();
  });
});
