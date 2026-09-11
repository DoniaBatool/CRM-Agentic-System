/**
 * Tests for lib/sara-agent.js — Sara pure functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock axios ─────────────────────────────────────────────────────────────────
vi.mock("axios", () => {
  const mockPost = vi.fn();
  return { default: { post: mockPost, create: () => ({ post: mockPost }) }, post: mockPost };
});

// ── Mock Supabase ──────────────────────────────────────────────────────────────
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockDelete = vi.fn();
const mockSingle = vi.fn();
const mockOrder  = vi.fn();
const mockLimit  = vi.fn();
const mockEq     = vi.fn();
const mockUpdate = vi.fn();

vi.mock("../lib/supabase.js", () => ({
  getSupabase: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: mockInsert.mockReturnThis(),
      select: mockSelect.mockReturnThis(),
      delete: mockDelete.mockReturnThis(),
      update: mockUpdate.mockReturnThis(),
      order:  mockOrder.mockReturnThis(),
      limit:  mockLimit.mockReturnThis(),
      eq:     mockEq.mockReturnThis(),
      single: mockSingle,
    })),
  })),
}));

import axios from "axios";
import {
  getBuiltInWebhookMap,
  getDefaultDateTime,
  resolveWebhookUrl,
  fireWebhook,
  saveWebhookHistory,
  getWebhookHistory,
  healthCheckWebhooks,
  BUILT_IN_EVENT_LABELS,
} from "../lib/sara-agent.js";

// ─── getBuiltInWebhookMap ────────────────────────────────────────────────────

describe("getBuiltInWebhookMap", () => {
  it("returns an object with treatment and personal_consultation keys", () => {
    const map = getBuiltInWebhookMap();
    expect(map).toHaveProperty("treatment");
    expect(map).toHaveProperty("personal_consultation");
  });

  it("returns null for unconfigured webhooks", () => {
    delete process.env.GHL_WEBHOOK_TREATMENT_BOOKED;
    const map = getBuiltInWebhookMap();
    expect(map.treatment.booked).toBeNull();
  });

  it("reads from env when set", () => {
    process.env.GHL_WEBHOOK_TREATMENT_BOOKED = "https://example.com/hook";
    const map = getBuiltInWebhookMap();
    expect(map.treatment.booked).toBe("https://example.com/hook");
    delete process.env.GHL_WEBHOOK_TREATMENT_BOOKED;
  });
});

// ─── BUILT_IN_EVENT_LABELS ───────────────────────────────────────────────────

describe("BUILT_IN_EVENT_LABELS", () => {
  it("exports 4 built-in event labels", () => {
    expect(BUILT_IN_EVENT_LABELS).toHaveLength(4);
  });

  it("each label has eventType and action", () => {
    BUILT_IN_EVENT_LABELS.forEach((ev) => {
      expect(ev).toHaveProperty("label");
      expect(ev).toHaveProperty("eventType");
      expect(ev).toHaveProperty("action");
    });
  });
});

// ─── getDefaultDateTime ───────────────────────────────────────────────────────

describe("getDefaultDateTime", () => {
  it("returns a string matching YYYY-MM-DDTHH:MM format", () => {
    const dt = getDefaultDateTime();
    expect(dt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("returns a datetime in the future (tomorrow)", () => {
    const dt = getDefaultDateTime();
    const returned = new Date(dt).getTime();
    const now = Date.now();
    expect(returned).toBeGreaterThan(now);
  });
});

// ─── resolveWebhookUrl ───────────────────────────────────────────────────────

describe("resolveWebhookUrl", () => {
  beforeEach(() => {
    process.env.GHL_WEBHOOK_TREATMENT_BOOKED = "https://env.example.com/treatment-booked";
    process.env.GHL_WEBHOOK_TREATMENT_RESCHEDULED = "https://env.example.com/treatment-rescheduled";
    process.env.GHL_WEBHOOK_PC_BOOKED = "https://env.example.com/pc-booked";
    process.env.GHL_WEBHOOK_PC_RESCHEDULED = "https://env.example.com/pc-rescheduled";
  });

  afterEach(() => {
    delete process.env.GHL_WEBHOOK_TREATMENT_BOOKED;
    delete process.env.GHL_WEBHOOK_TREATMENT_RESCHEDULED;
    delete process.env.GHL_WEBHOOK_PC_BOOKED;
    delete process.env.GHL_WEBHOOK_PC_RESCHEDULED;
  });

  it("returns customUrl when provided", () => {
    const url = resolveWebhookUrl("treatment", "booked", "https://custom.example.com/hook");
    expect(url).toBe("https://custom.example.com/hook");
  });

  it("resolves treatment/booked from env map", () => {
    const url = resolveWebhookUrl("treatment", "booked");
    expect(url).toBe("https://env.example.com/treatment-booked");
  });

  it("resolves treatment/rescheduled from env map", () => {
    const url = resolveWebhookUrl("treatment", "rescheduled");
    expect(url).toBe("https://env.example.com/treatment-rescheduled");
  });

  it("resolves personal consultation booked from env map", () => {
    const url = resolveWebhookUrl("Personal Consultation", "booked");
    expect(url).toBe("https://env.example.com/pc-booked");
  });

  it("returns null when env not set and no custom URL", () => {
    delete process.env.GHL_WEBHOOK_TREATMENT_BOOKED;
    const url = resolveWebhookUrl("treatment", "booked");
    expect(url).toBeNull();
  });

  it("ignores empty customUrl string", () => {
    const url = resolveWebhookUrl("treatment", "booked", "  ");
    expect(url).toBe("https://env.example.com/treatment-booked");
  });
});

// ─── fireWebhook ────────────────────────────────────────────────────────────

describe("fireWebhook", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("throws when webhookUrl is missing", async () => {
    await expect(fireWebhook({ webhookUrl: null, payload: {} })).rejects.toThrow("webhookUrl is required");
  });

  it("throws when payload is missing", async () => {
    await expect(fireWebhook({ webhookUrl: "https://example.com", payload: null })).rejects.toThrow("payload is required");
  });

  it("returns success=true on 200 response", async () => {
    axios.post.mockResolvedValue({ status: 200, statusText: "OK", data: { received: true } });
    const result = await fireWebhook({ webhookUrl: "https://example.com/hook", payload: { event: "treatment" } });
    expect(result.success).toBe(true);
    expect(result.status_code).toBe(200);
    expect(result.status_text).toBe("OK");
  });

  it("returns success=false on 4xx response", async () => {
    const mockErr = new Error("Not Found");
    mockErr.response = { status: 404, statusText: "Not Found", data: { error: "not found" } };
    axios.post.mockRejectedValue(mockErr);
    const result = await fireWebhook({ webhookUrl: "https://example.com/hook", payload: { event: "test" } });
    expect(result.success).toBe(false);
    expect(result.status_code).toBe(404);
  });

  it("returns success=false on network error", async () => {
    axios.post.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await fireWebhook({ webhookUrl: "https://example.com/hook", payload: {} });
    expect(result.success).toBe(false);
    expect(result.status_code).toBeNull();
  });

  it("serializes response data to string", async () => {
    axios.post.mockResolvedValue({ status: 200, statusText: "OK", data: { ok: true } });
    const result = await fireWebhook({ webhookUrl: "https://example.com/hook", payload: {} });
    expect(typeof result.response_body).toBe("string");
  });
});

// ─── saveWebhookHistory ──────────────────────────────────────────────────────

describe("saveWebhookHistory", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns saved=true on success", async () => {
    mockSingle.mockResolvedValue({ data: { id: "uuid-123" }, error: null });
    const result = await saveWebhookHistory({
      contactName: "Ali Khan",
      eventType: "treatment",
      action: "booked",
      webhookUrl: "https://example.com",
      payload: {},
      statusCode: 200,
      statusText: "OK",
      success: true,
    });
    expect(result.saved).toBe(true);
    expect(result.id).toBe("uuid-123");
  });

  it("returns saved=false on Supabase error", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "DB error" } });
    const result = await saveWebhookHistory({ contactName: "Test", success: false });
    expect(result.saved).toBe(false);
    expect(result.id).toBeNull();
  });

  it("returns saved=false when Supabase not connected", async () => {
    const { getSupabase } = await import("../lib/supabase.js");
    getSupabase.mockReturnValueOnce(null);
    const result = await saveWebhookHistory({ contactName: "Test", success: true });
    expect(result.saved).toBe(false);
  });
});

// ─── getWebhookHistory ───────────────────────────────────────────────────────

describe("getWebhookHistory", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns empty array when Supabase not connected", async () => {
    const { getSupabase } = await import("../lib/supabase.js");
    getSupabase.mockReturnValueOnce(null);
    const result = await getWebhookHistory();
    expect(result).toEqual([]);
  });

  it("returns rows on success", async () => {
    mockLimit.mockResolvedValue({ data: [{ id: "1", success: true }], error: null });
    const result = await getWebhookHistory({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns empty array on DB error", async () => {
    mockLimit.mockResolvedValue({ data: null, error: { message: "error" } });
    const result = await getWebhookHistory();
    expect(result).toEqual([]);
  });
});

// ─── healthCheckWebhooks ────────────────────────────────────────────────────

describe("healthCheckWebhooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GHL_WEBHOOK_TREATMENT_BOOKED;
    delete process.env.GHL_WEBHOOK_TREATMENT_RESCHEDULED;
    delete process.env.GHL_WEBHOOK_PC_BOOKED;
    delete process.env.GHL_WEBHOOK_PC_RESCHEDULED;
  });

  it("returns pending for unconfigured webhooks", async () => {
    const results = await healthCheckWebhooks([]);
    const pending = results.filter((r) => r.status === "pending");
    expect(pending.length).toBe(4); // all 4 built-in unconfigured
  });

  it("returns live for successful HTTP response", async () => {
    process.env.GHL_WEBHOOK_TREATMENT_BOOKED = "https://example.com/hook";
    axios.post.mockResolvedValue({ status: 200, statusText: "OK" });
    const results = await healthCheckWebhooks([]);
    const liveResult = results.find((r) => r.label === "Treatment Booked");
    expect(liveResult?.status).toBe("live");
  });

  it("returns dead on network error", async () => {
    process.env.GHL_WEBHOOK_TREATMENT_BOOKED = "https://dead.example.com/hook";
    axios.post.mockRejectedValue(new Error("ECONNREFUSED"));
    const results = await healthCheckWebhooks([]);
    const deadResult = results.find((r) => r.label === "Treatment Booked");
    expect(deadResult?.status).toBe("dead");
  });

  it("includes custom events in health check", async () => {
    const customEvents = [{ event_label: "Whitening Booked", webhook_url: null }];
    const results = await healthCheckWebhooks(customEvents);
    const custom = results.find((r) => r.label === "Whitening Booked");
    expect(custom).toBeDefined();
    expect(custom.status).toBe("pending");
  });

  it("returns 4 results for 4 built-in events with no custom", async () => {
    const results = await healthCheckWebhooks([]);
    expect(results).toHaveLength(4);
  });
});
