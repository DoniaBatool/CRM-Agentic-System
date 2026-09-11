import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { chromium } from "playwright";

// ─── We mock fetch globally before importing the module ────────────────────────
// workflow-agent.js uses global fetch for GHL API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// We also need to mock playwright (chromium) since exportWorkflow uses it
// and we don't want browser to actually open in tests
vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
          goto: vi.fn().mockResolvedValue(undefined),
          reload: vi.fn().mockResolvedValue(undefined),
          on: vi.fn(),
          off: vi.fn(),
          url: vi.fn().mockReturnValue("https://app.bucktoothmarketing.com/dashboard"),
          waitForURL: vi.fn().mockResolvedValue(undefined),
          waitForTimeout: vi.fn().mockResolvedValue(undefined),
          waitForLoadState: vi.fn().mockResolvedValue(undefined),
          addInitScript: vi.fn().mockResolvedValue(undefined),
          evaluate: vi.fn().mockResolvedValue({ workflow: null, trigger: null }),
        }),
        storageState: vi.fn().mockResolvedValue(undefined),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

// Mock readline so interactive CLI doesn't block
vi.mock("readline", () => ({
  default: { createInterface: vi.fn().mockReturnValue({ question: vi.fn(), close: vi.fn() }) },
  createInterface: vi.fn().mockReturnValue({ question: vi.fn(), close: vi.fn() }),
}));

// Mock OpenAI (imported in workflow-agent.js)
vi.mock("openai", () => ({
  default: class OpenAI {
    constructor() {}
  },
}));

import {
  listWorkflows,
  exportSelectedWorkflows,
  listExportedWorkflowFiles,
  deleteExportedWorkflowFiles,
} from "../workflow-agent.js";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ghl-test-"));
}

const SAMPLE_WORKFLOWS = [
  { id: "wf-001", name: "WF-01 Survey Intake", status: "published" },
  { id: "wf-002", name: "WF-02 Appointment Booked", status: "published" },
  { id: "wf-003", name: "WF-03 Lead Nurture", status: "draft" },
];

function mockFetchSuccess(workflows = SAMPLE_WORKFLOWS) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ workflows }),
  });
}

function mockFetchError(status = 401, message = "Unauthorized") {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({ message }),
  });
}

// ─── listWorkflows ─────────────────────────────────────────────────────────────

describe("listWorkflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns workflows array on success", async () => {
    mockFetchSuccess();
    const result = await listWorkflows({ locationId: "loc-123", token: "tok-abc" });
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("wf-001");
  });

  it("throws when locationId is missing", async () => {
    await expect(listWorkflows({ token: "tok-abc" })).rejects.toThrow(
      "locationId and token are required"
    );
  });

  it("throws when token is missing", async () => {
    await expect(listWorkflows({ locationId: "loc-123" })).rejects.toThrow(
      "locationId and token are required"
    );
  });

  it("throws when both are missing", async () => {
    await expect(listWorkflows({})).rejects.toThrow(
      "locationId and token are required"
    );
  });

  it("throws on GHL API error with message", async () => {
    mockFetchError(401, "Invalid token");
    await expect(listWorkflows({ locationId: "loc-123", token: "bad-tok" })).rejects.toThrow(
      "GHL API error (HTTP 401): Invalid token"
    );
  });

  it("throws on GHL API 404 error", async () => {
    mockFetchError(404, "Location not found");
    await expect(listWorkflows({ locationId: "bad-loc", token: "tok-abc" })).rejects.toThrow(
      "GHL API error (HTTP 404)"
    );
  });

  it("returns empty array when API returns no workflows", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}), // no 'workflows' key
    });
    const result = await listWorkflows({ locationId: "loc-123", token: "tok-abc" });
    expect(result).toEqual([]);
  });

  it("calls fetch with correct Authorization header", async () => {
    mockFetchSuccess();
    await listWorkflows({ locationId: "loc-123", token: "my-token" });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("loc-123"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer my-token" }),
      })
    );
  });
});

// ─── listExportedWorkflowFiles ─────────────────────────────────────────────────

describe("listExportedWorkflowFiles", () => {
  let tmpDir;
  const originalCwd = process.cwd();

  beforeEach(() => {
    tmpDir = makeTempDir();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws when subAccountName is missing", () => {
    expect(() => listExportedWorkflowFiles({})).toThrow("subAccountName is required");
  });

  it("returns empty files array when directory does not exist", () => {
    const result = listExportedWorkflowFiles({ subAccountName: "nonexistent" });
    expect(result.files).toEqual([]);
    expect(result.outputDir).toContain("nonexistent");
  });

  it("returns json files from the sub-account directory", () => {
    const dir = path.join(tmpDir, "workflows", "testclient");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "WF-01.json"), "{}");
    fs.writeFileSync(path.join(dir, "WF-02.json"), "{}");
    fs.writeFileSync(path.join(dir, "notes.txt"), "not a json");

    const result = listExportedWorkflowFiles({ subAccountName: "TestClient" });
    expect(result.files).toHaveLength(2);
    expect(result.files.every((f) => f.fileName.endsWith(".json"))).toBe(true);
  });

  it("sanitizes sub-account name with invalid characters", () => {
    const result = listExportedWorkflowFiles({ subAccountName: 'Client<Name>:Test' });
    expect(result.outputDir).not.toMatch(/[<>:]/);
  });

  it("each file entry has id, fileName, filePath", () => {
    const dir = path.join(tmpDir, "workflows", "myclient");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "workflow.json"), "{}");

    const result = listExportedWorkflowFiles({ subAccountName: "MyClient" });
    const file = result.files[0];
    expect(file).toHaveProperty("id");
    expect(file).toHaveProperty("fileName");
    expect(file).toHaveProperty("filePath");
  });
});

// ─── deleteExportedWorkflowFiles ───────────────────────────────────────────────

describe("deleteExportedWorkflowFiles", () => {
  let tmpDir;
  const originalCwd = process.cwd();

  beforeEach(() => {
    tmpDir = makeTempDir();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws when subAccountName is missing", () => {
    expect(() => deleteExportedWorkflowFiles({ fileNames: ["a.json"] })).toThrow(
      "subAccountName is required"
    );
  });

  it("throws when fileNames is empty", () => {
    expect(() =>
      deleteExportedWorkflowFiles({ subAccountName: "Client", fileNames: [] })
    ).toThrow("fileNames must be a non-empty array");
  });

  it("throws when fileNames is not an array", () => {
    expect(() =>
      deleteExportedWorkflowFiles({ subAccountName: "Client", fileNames: "file.json" })
    ).toThrow("fileNames must be a non-empty array");
  });

  it("deletes existing files and reports correctly", () => {
    const dir = path.join(tmpDir, "workflows", "client");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "WF-01.json"), "{}");
    fs.writeFileSync(path.join(dir, "WF-02.json"), "{}");

    const result = deleteExportedWorkflowFiles({
      subAccountName: "Client",
      fileNames: ["WF-01.json", "WF-02.json"],
    });

    expect(result.deletedCount).toBe(2);
    expect(result.deletedFiles).toContain("WF-01.json");
    expect(result.missingFiles).toHaveLength(0);
    expect(fs.existsSync(path.join(dir, "WF-01.json"))).toBe(false);
  });

  it("reports missing files without throwing", () => {
    const dir = path.join(tmpDir, "workflows", "client");
    fs.mkdirSync(dir, { recursive: true });

    const result = deleteExportedWorkflowFiles({
      subAccountName: "Client",
      fileNames: ["ghost.json"],
    });

    expect(result.deletedCount).toBe(0);
    expect(result.missingFiles).toContain("ghost.json");
  });

  it("handles mix of existing and missing files", () => {
    const dir = path.join(tmpDir, "workflows", "client");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "exists.json"), "{}");

    const result = deleteExportedWorkflowFiles({
      subAccountName: "Client",
      fileNames: ["exists.json", "ghost.json"],
    });

    expect(result.deletedCount).toBe(1);
    expect(result.deletedFiles).toContain("exists.json");
    expect(result.missingFiles).toContain("ghost.json");
  });
});

// ─── exportSelectedWorkflows ───────────────────────────────────────────────────

describe("exportSelectedWorkflows — validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws when subAccountName missing", async () => {
    await expect(
      exportSelectedWorkflows({ locationId: "l", token: "t", workflowIds: ["wf-001"] })
    ).rejects.toThrow("subAccountName");
  });

  it("throws when locationId missing", async () => {
    await expect(
      exportSelectedWorkflows({ subAccountName: "Client", token: "t", workflowIds: ["wf-001"] })
    ).rejects.toThrow("locationId");
  });

  it("throws when token missing", async () => {
    await expect(
      exportSelectedWorkflows({ subAccountName: "Client", locationId: "l", workflowIds: ["wf-001"] })
    ).rejects.toThrow("token");
  });

  it("throws when workflowIds is empty array", async () => {
    await expect(
      exportSelectedWorkflows({ subAccountName: "c", locationId: "l", token: "t", workflowIds: [] })
    ).rejects.toThrow("workflowIds must be a non-empty array");
  });

  it("throws when workflowIds is not an array", async () => {
    await expect(
      exportSelectedWorkflows({ subAccountName: "c", locationId: "l", token: "t", workflowIds: "wf-001" })
    ).rejects.toThrow("workflowIds must be a non-empty array");
  });

  it("returns exportedCount 0 when none of the IDs exist in API response", async () => {
    mockFetchSuccess([{ id: "wf-999", name: "Other" }]);
    const result = await exportSelectedWorkflows({
      subAccountName: "Client",
      locationId: "l",
      token: "t",
      workflowIds: ["wf-001", "wf-002"],
    });
    expect(result.exportedCount).toBe(0);
    expect(result.missingWorkflowIds).toEqual(["wf-001", "wf-002"]);
  });
});

describe("exportSelectedWorkflows — API-first export (no Playwright)", () => {
  let tmpDir;
  const originalCwd = process.cwd();
  // chromium is already mocked via vi.mock("playwright") at the top of this file

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = makeTempDir();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("exports workflow via API and skips Playwright entirely", async () => {
    // Call 1: workflow list
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ workflows: [{ id: "wf-001", name: "WF-01 Survey Intake", status: "published" }] }),
    });
    // Call 2: workflow detail (fetchWorkflowViaApi)
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({
        _id: "wf-001",
        name: "WF-01 Survey Intake",
        workflowData: { templates: [{ id: "step-1", type: "add_contact_tag" }] },
        fileUrl: "https://firebasestorage.googleapis.com/v0/b/test/o/path?alt=media&token=tok123",
        triggersFilePath: "location/loc-1/workflow-triggers/wf-001/1",
      }),
    });
    // Call 3: Firebase trigger
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => [{ type: "opportunity_created", workflow_id: "wf-001" }],
    });

    const result = await exportSelectedWorkflows({
      subAccountName: "TestClient",
      locationId: "loc-1",
      token: "tok-abc",
      workflowIds: ["wf-001"],
    });

    expect(result.exportedCount).toBe(1);
    expect(result.exportedWorkflows[0].id).toBe("wf-001");
    // Playwright should NOT have been launched (API succeeded)
    expect(chromium.launch).not.toHaveBeenCalled();
    // File should exist
    const files = fs.readdirSync(path.join(tmpDir, "workflows", "testclient"));
    expect(files.length).toBe(1);
    expect(files[0]).toContain("WF-01");
    // File content should have workflow_json and trigger_json
    const saved = JSON.parse(fs.readFileSync(path.join(tmpDir, "workflows", "testclient", files[0]), "utf8"));
    expect(saved.workflow_json.workflowData).toBeDefined();
    expect(saved.trigger_json).toBeDefined();
    expect(Array.isArray(saved.trigger_json)).toBe(true);
  });

  it("saves workflow_json even when trigger fetch fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ workflows: [{ id: "wf-001", name: "WF-01", status: "published" }] }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({
        _id: "wf-001", workflowData: { templates: [] },
        fileUrl: "https://firebasestorage.googleapis.com/v0/b/test/o/x?alt=media&token=t",
        triggersFilePath: "location/loc/triggers/wf-001/1",
      }),
    });
    // Trigger fetch fails
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });

    const result = await exportSelectedWorkflows({
      subAccountName: "Client",
      locationId: "loc-1",
      token: "tok",
      workflowIds: ["wf-001"],
    });

    expect(result.exportedCount).toBe(1);
    const files = fs.readdirSync(path.join(tmpDir, "workflows", "client"));
    const saved = JSON.parse(fs.readFileSync(path.join(tmpDir, "workflows", "client", files[0]), "utf8"));
    expect(saved.workflow_json).not.toBeNull();
    expect(saved.trigger_json).toBeNull();
  });

  it("falls back to Playwright when API detail endpoint returns non-OK", async () => {
    // List
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ workflows: [{ id: "wf-001", name: "WF-01" }] }),
    });
    // Detail — 401 (API not available with this token)
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => "Unauthorized" });

    await exportSelectedWorkflows({
      subAccountName: "Client",
      locationId: "loc-1",
      token: "tok",
      workflowIds: ["wf-001"],
    });

    // Playwright SHOULD have been launched as fallback
    expect(chromium.launch).toHaveBeenCalled();
  });
});
