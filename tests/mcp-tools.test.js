import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock axios before importing mcp-tools (handleSendInboundWebhook uses it directly)
vi.mock("axios", async () => {
  const mockAxios = vi.fn();
  mockAxios.create = vi.fn(() => ({}));
  return { default: mockAxios };
});

import axios from "axios";
import {
  handleListWorkflows,
  handleGetWorkflow,
  handleSendInboundWebhook,
  handleFindContact,
  handleTriggerWorkflow,
  handleRemoveContactFromWorkflow,
  handleTestRunWorkflow,
} from "../lib/mcp-tools.js";

// ─── Mock ghlClient ────────────────────────────────────────────────────────────
function makeGhlClient(overrides = {}) {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

const DEFAULT_LOC = "loc-default-123";

// ─── handleListWorkflows ───────────────────────────────────────────────────────

describe("handleListWorkflows", () => {
  it("returns formatted workflow list on success", async () => {
    const client = makeGhlClient({
      get: vi.fn().mockResolvedValueOnce({
        data: {
          workflows: [
            { id: "wf-1", name: "Survey", status: "published", version: 2, createdAt: "2024-01-01", updatedAt: "2024-01-02" },
          ],
        },
      }),
    });

    const result = await handleListWorkflows({}, client, DEFAULT_LOC);
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Total workflows: 1");
    expect(result.content[0].text).toContain("wf-1");
  });

  it("uses provided locationId over default", async () => {
    const client = makeGhlClient({
      get: vi.fn().mockResolvedValueOnce({ data: { workflows: [] } }),
    });
    await handleListWorkflows({ locationId: "loc-custom" }, client, DEFAULT_LOC);
    expect(client.get).toHaveBeenCalledWith("/workflows/", {
      params: { locationId: "loc-custom" },
    });
  });

  it("falls back to defaultLocationId when locationId not provided", async () => {
    const client = makeGhlClient({
      get: vi.fn().mockResolvedValueOnce({ data: { workflows: [] } }),
    });
    await handleListWorkflows({}, client, DEFAULT_LOC);
    expect(client.get).toHaveBeenCalledWith("/workflows/", {
      params: { locationId: DEFAULT_LOC },
    });
  });

  it("returns isError on API failure", async () => {
    const client = makeGhlClient({
      get: vi.fn().mockRejectedValueOnce({ message: "Unauthorized", response: { data: { message: "Unauthorized" } } }),
    });
    const result = await handleListWorkflows({}, client, DEFAULT_LOC);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error: Unauthorized");
  });

  it("handles empty workflows array gracefully", async () => {
    const client = makeGhlClient({
      get: vi.fn().mockResolvedValueOnce({ data: { workflows: [] } }),
    });
    const result = await handleListWorkflows({}, client, DEFAULT_LOC);
    expect(result.content[0].text).toContain("Total workflows: 0");
  });
});

// ─── handleGetWorkflow ─────────────────────────────────────────────────────────

describe("handleGetWorkflow", () => {
  it("returns workflow JSON on success", async () => {
    const client = makeGhlClient({
      get: vi.fn().mockResolvedValueOnce({ data: { id: "wf-1", name: "Test" } }),
    });
    const result = await handleGetWorkflow({ workflowId: "wf-1" }, client, DEFAULT_LOC);
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("wf-1");
  });

  it("returns isError on failure", async () => {
    const client = makeGhlClient({
      get: vi.fn().mockRejectedValueOnce({ message: "Not found", response: { data: { message: "Not found" } } }),
    });
    const result = await handleGetWorkflow({ workflowId: "wf-bad" }, client, DEFAULT_LOC);
    expect(result.isError).toBe(true);
  });
});

// ─── handleSendInboundWebhook ──────────────────────────────────────────────────

describe("handleSendInboundWebhook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns success message on 200", async () => {
    axios.mockResolvedValueOnce({ status: 200, statusText: "OK", data: { received: true } });

    const result = await handleSendInboundWebhook({
      webhookUrl: "https://example.com/hook",
      method: "POST",
      payload: { name: "Test" },
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("successfully bheja gaya");
  });

  it("defaults to POST when method not provided", async () => {
    axios.mockResolvedValueOnce({ status: 200, statusText: "OK", data: {} });
    await handleSendInboundWebhook({ webhookUrl: "https://example.com/hook" });
    expect(axios).toHaveBeenCalledWith(expect.objectContaining({ method: "POST" }));
  });

  it("returns isError on network failure", async () => {
    axios.mockRejectedValueOnce(new Error("Connection refused"));
    const result = await handleSendInboundWebhook({
      webhookUrl: "https://bad-url.example.com/hook",
      payload: {},
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Webhook Error");
  });

  it("includes extra headers when provided", async () => {
    axios.mockResolvedValueOnce({ status: 200, statusText: "OK", data: {} });
    await handleSendInboundWebhook({
      webhookUrl: "https://example.com/hook",
      headers: { "X-Custom": "value" },
    });
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({ headers: expect.objectContaining({ "X-Custom": "value" }) })
    );
  });
});

// ─── handleFindContact ─────────────────────────────────────────────────────────

describe("handleFindContact", () => {
  it("returns isError when no search field provided", async () => {
    const client = makeGhlClient();
    const result = await handleFindContact({}, client, DEFAULT_LOC);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("ek field do");
  });

  it("returns contacts when found by email", async () => {
    const client = makeGhlClient({
      get: vi.fn().mockResolvedValueOnce({
        data: { contacts: [{ id: "c-1", name: "John", email: "john@test.com", phone: "+1", tags: [] }] },
      }),
    });
    const result = await handleFindContact({ email: "john@test.com" }, client, DEFAULT_LOC);
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("1 contact(s) mila");
    expect(result.content[0].text).toContain("c-1");
  });

  it("returns warning when no contacts found", async () => {
    const client = makeGhlClient({
      get: vi.fn().mockResolvedValueOnce({ data: { contacts: [] } }),
    });
    const result = await handleFindContact({ name: "Ghost" }, client, DEFAULT_LOC);
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Koi contact nahi mila");
  });

  it("includes email, phone, name in search params when all provided", async () => {
    const client = makeGhlClient({
      get: vi.fn().mockResolvedValueOnce({ data: { contacts: [] } }),
    });
    await handleFindContact({ email: "a@b.com", phone: "+1", name: "Ali" }, client, DEFAULT_LOC);
    const calledWith = client.get.mock.calls[0][1].params;
    expect(calledWith.email).toBe("a@b.com");
    expect(calledWith.phone).toBe("+1");
    expect(calledWith.query).toBe("Ali");
  });

  it("returns isError on API failure", async () => {
    const client = makeGhlClient({
      get: vi.fn().mockRejectedValueOnce({ message: "fail", response: { data: { message: "fail" } } }),
    });
    const result = await handleFindContact({ email: "x@y.com" }, client, DEFAULT_LOC);
    expect(result.isError).toBe(true);
  });
});

// ─── handleTriggerWorkflow ─────────────────────────────────────────────────────

describe("handleTriggerWorkflow", () => {
  it("returns success message on trigger", async () => {
    const client = makeGhlClient({
      post: vi.fn().mockResolvedValueOnce({ data: { success: true } }),
    });
    const result = await handleTriggerWorkflow(
      { workflowId: "wf-1", contactId: "c-1" },
      client,
      DEFAULT_LOC
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Workflow trigger ho gaya");
  });

  it("includes eventStartTime in body when provided", async () => {
    const client = makeGhlClient({
      post: vi.fn().mockResolvedValueOnce({ data: {} }),
    });
    await handleTriggerWorkflow(
      { workflowId: "wf-1", contactId: "c-1", eventStartTime: "2026-06-10T10:00:00" },
      client,
      DEFAULT_LOC
    );
    expect(client.post).toHaveBeenCalledWith(
      "/contacts/c-1/workflow/wf-1",
      { eventStartTime: "2026-06-10T10:00:00" },
      expect.any(Object)
    );
  });

  it("sends empty body when eventStartTime not provided", async () => {
    const client = makeGhlClient({
      post: vi.fn().mockResolvedValueOnce({ data: {} }),
    });
    await handleTriggerWorkflow({ workflowId: "wf-1", contactId: "c-1" }, client, DEFAULT_LOC);
    expect(client.post).toHaveBeenCalledWith(
      "/contacts/c-1/workflow/wf-1",
      {},
      expect.any(Object)
    );
  });

  it("returns isError on trigger failure", async () => {
    const client = makeGhlClient({
      post: vi.fn().mockRejectedValueOnce({ response: { status: 422, data: { message: "Not published" } } }),
    });
    const result = await handleTriggerWorkflow({ workflowId: "wf-bad", contactId: "c-1" }, client, DEFAULT_LOC);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("trigger fail");
  });
});

// ─── handleRemoveContactFromWorkflow ──────────────────────────────────────────

describe("handleRemoveContactFromWorkflow", () => {
  it("returns success on removal", async () => {
    const client = makeGhlClient({
      delete: vi.fn().mockResolvedValueOnce({ data: {} }),
    });
    const result = await handleRemoveContactFromWorkflow(
      { workflowId: "wf-1", contactId: "c-1" },
      client,
      DEFAULT_LOC
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("remove ho gaya");
  });

  it("returns isError on failure", async () => {
    const client = makeGhlClient({
      delete: vi.fn().mockRejectedValueOnce({ response: { status: 404, data: { message: "Not found" } } }),
    });
    const result = await handleRemoveContactFromWorkflow(
      { workflowId: "wf-1", contactId: "c-bad" },
      client,
      DEFAULT_LOC
    );
    expect(result.isError).toBe(true);
  });
});

// ─── handleTestRunWorkflow ─────────────────────────────────────────────────────

describe("handleTestRunWorkflow", () => {
  it("returns summary on full success", async () => {
    const client = makeGhlClient({
      post: vi.fn()
        .mockResolvedValueOnce({ data: { contact: { id: "c-new-1" } } }) // contact creation
        .mockResolvedValueOnce({ data: { success: true } }),              // workflow trigger
    });

    const result = await handleTestRunWorkflow(
      { workflowId: "wf-1", testContactName: "Test User", testContactEmail: "test@example.com" },
      client,
      DEFAULT_LOC
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Test Summary");
    expect(result.content[0].text).toContain("wf-1");
  });

  it("returns isError when contact creation fails", async () => {
    const client = makeGhlClient({
      post: vi.fn().mockRejectedValueOnce({ message: "Contact limit reached", response: { data: { message: "limit" } } }),
    });
    const result = await handleTestRunWorkflow(
      { workflowId: "wf-1" },
      client,
      DEFAULT_LOC
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Contact banane mein error");
  });

  it("returns isError when workflow trigger fails after contact created", async () => {
    const client = makeGhlClient({
      post: vi.fn()
        .mockResolvedValueOnce({ data: { contact: { id: "c-1" } } })
        .mockRejectedValueOnce({ message: "Not published", response: { data: { message: "Not published" } } }),
    });
    const result = await handleTestRunWorkflow(
      { workflowId: "wf-1" },
      client,
      DEFAULT_LOC
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Tip: Workflow published hai");
  });

  it("performs cleanup when cleanupAfterTest is true", async () => {
    const client = makeGhlClient({
      post: vi.fn()
        .mockResolvedValueOnce({ data: { contact: { id: "c-1" } } })
        .mockResolvedValueOnce({ data: {} }),
      delete: vi.fn().mockResolvedValueOnce({ data: {} }),
    });
    await handleTestRunWorkflow(
      { workflowId: "wf-1", cleanupAfterTest: true },
      client,
      DEFAULT_LOC
    );
    expect(client.delete).toHaveBeenCalledWith(
      "/contacts/c-1/workflow/wf-1",
      expect.any(Object)
    );
  });

  it("does not call delete when cleanupAfterTest is false", async () => {
    const client = makeGhlClient({
      post: vi.fn()
        .mockResolvedValueOnce({ data: { contact: { id: "c-1" } } })
        .mockResolvedValueOnce({ data: {} }),
      delete: vi.fn(),
    });
    await handleTestRunWorkflow(
      { workflowId: "wf-1", cleanupAfterTest: false },
      client,
      DEFAULT_LOC
    );
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("auto-generates email when not provided", async () => {
    const client = makeGhlClient({
      post: vi.fn()
        .mockResolvedValueOnce({ data: { contact: { id: "c-1" } } })
        .mockResolvedValueOnce({ data: {} }),
    });
    await handleTestRunWorkflow({ workflowId: "wf-1" }, client, DEFAULT_LOC);
    const createCall = client.post.mock.calls[0][1];
    expect(createCall.email).toMatch(/mcp-test-\d+@test-workflow\.com/);
  });
});
