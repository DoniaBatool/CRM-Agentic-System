import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock axios BEFORE importing the module ────────────────────────────────────
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal();
  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
  const mockAxios = vi.fn(); // default axios() call for sendWebhook
  mockAxios.create = vi.fn(() => mockAxiosInstance);
  mockAxios.post = vi.fn();
  mockAxios.get = vi.fn();
  mockAxios.__instance = mockAxiosInstance;
  return { default: mockAxios };
});

// Mock readline so the interactive CLI doesn't block
vi.mock("readline", () => ({
  default: {
    createInterface: vi.fn().mockReturnValue({ question: vi.fn(), close: vi.fn() }),
  },
  createInterface: vi.fn().mockReturnValue({ question: vi.fn(), close: vi.fn() }),
}));

import axios from "axios";
import {
  getWebhookMap,
  getSuggestedDateTime,
  searchContacts,
  triggerWorkflowWebhook,
} from "../ghl-webhook-trigger.js";

const mockAxiosInstance = axios.__instance;

// ─── getWebhookMap ─────────────────────────────────────────────────────────────

describe("getWebhookMap", () => {
  it("returns an object with treatment and personal_consultation keys", () => {
    const map = getWebhookMap();
    expect(map).toHaveProperty("treatment");
    expect(map).toHaveProperty("personal_consultation");
  });

  it("each category has booked and rescheduled keys", () => {
    const map = getWebhookMap();
    expect(map.treatment).toHaveProperty("booked");
    expect(map.treatment).toHaveProperty("rescheduled");
    expect(map.personal_consultation).toHaveProperty("booked");
    expect(map.personal_consultation).toHaveProperty("rescheduled");
  });
});

// ─── getSuggestedDateTime ──────────────────────────────────────────────────────

describe("getSuggestedDateTime", () => {
  it("returns a string", () => {
    expect(typeof getSuggestedDateTime()).toBe("string");
  });

  it("returns a datetime in YYYY-MM-DDTHH:MM:SS format", () => {
    const result = getSuggestedDateTime();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it("returns a future date (tomorrow or later)", () => {
    const result = getSuggestedDateTime();
    const returned = new Date(result);
    const now = new Date();
    expect(returned.getTime()).toBeGreaterThan(now.getTime());
  });

  it("returns time at 10:00:00", () => {
    const result = getSuggestedDateTime();
    expect(result).toMatch(/T10:00:00$/);
  });
});

// ─── searchContacts ────────────────────────────────────────────────────────────

describe("searchContacts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws on empty query string", async () => {
    await expect(searchContacts("")).rejects.toThrow("Contact query is required");
  });

  it("throws on whitespace-only query", async () => {
    await expect(searchContacts("   ")).rejects.toThrow("Contact query is required");
  });

  it("throws on null/undefined query", async () => {
    await expect(searchContacts(null)).rejects.toThrow("Contact query is required");
    await expect(searchContacts(undefined)).rejects.toThrow("Contact query is required");
  });

  it("returns contacts array on success", async () => {
    const mockContacts = [
      { id: "c-001", name: "John Doe", email: "john@test.com", phone: "+1234567890" },
    ];
    mockAxiosInstance.get.mockResolvedValueOnce({ data: { contacts: mockContacts } });

    const result = await searchContacts("John");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c-001");
  });

  it("returns empty array when API returns no contacts", async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({ data: {} });
    const result = await searchContacts("Nonexistent Person");
    expect(result).toEqual([]);
  });

  it("calls the contacts search endpoint with the query", async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({ data: { contacts: [] } });
    await searchContacts("Sara Khan");
    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      "/contacts/search",
      expect.objectContaining({ params: expect.objectContaining({ query: "Sara Khan" }) })
    );
  });

  it("limits search results to 5", async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({ data: { contacts: [] } });
    await searchContacts("John");
    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      "/contacts/search",
      expect.objectContaining({ params: expect.objectContaining({ limit: 5 }) })
    );
  });

  it("propagates API errors", async () => {
    mockAxiosInstance.get.mockRejectedValueOnce(new Error("Network error"));
    await expect(searchContacts("John")).rejects.toThrow("Network error");
  });
});

// ─── triggerWorkflowWebhook ────────────────────────────────────────────────────

describe("triggerWorkflowWebhook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws when webhookUrl is missing", async () => {
    await expect(
      triggerWorkflowWebhook({ payload: { name: "test" } })
    ).rejects.toThrow("webhookUrl is required");
  });

  it("throws when payload is missing", async () => {
    await expect(
      triggerWorkflowWebhook({ webhookUrl: "https://example.com/hook" })
    ).rejects.toThrow("payload object is required");
  });

  it("throws when payload is not an object", async () => {
    await expect(
      triggerWorkflowWebhook({ webhookUrl: "https://example.com/hook", payload: "string" })
    ).rejects.toThrow("payload object is required");
  });

  it("throws when payload is null", async () => {
    await expect(
      triggerWorkflowWebhook({ webhookUrl: "https://example.com/hook", payload: null })
    ).rejects.toThrow("payload object is required");
  });

  it("returns status, statusText, data on success", async () => {
    axios.post.mockResolvedValueOnce({
      status: 200,
      statusText: "OK",
      data: { message: "received" },
    });

    const result = await triggerWorkflowWebhook({
      webhookUrl: "https://example.com/hook",
      payload: { event: "test", email: "a@b.com" },
    });

    expect(result.status).toBe(200);
    expect(result.statusText).toBe("OK");
    expect(result.data).toEqual({ message: "received" });
  });

  it("calls axios.post with the correct url and payload", async () => {
    axios.post.mockResolvedValueOnce({ status: 200, statusText: "OK", data: {} });

    const payload = { event: "treatment", action: "booked", email: "x@y.com" };
    await triggerWorkflowWebhook({ webhookUrl: "https://hook.example.com/wf", payload });

    expect(axios.post).toHaveBeenCalledWith(
      "https://hook.example.com/wf",
      payload,
      expect.objectContaining({ headers: expect.objectContaining({ "Content-Type": "application/json" }) })
    );
  });

  it("propagates HTTP errors from axios", async () => {
    const axiosError = new Error("Request failed with status 500");
    axios.post.mockRejectedValueOnce(axiosError);

    await expect(
      triggerWorkflowWebhook({
        webhookUrl: "https://example.com/hook",
        payload: { event: "test" },
      })
    ).rejects.toThrow("Request failed with status 500");
  });
});
