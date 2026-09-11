// tests/veronica-agent.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Hoist fs mocks ──────────────────────────────────────────────────────────
const { mockReadFile, mockReaddir } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockReaddir: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  default: { readFile: mockReadFile, readdir: mockReaddir },
  readFile: mockReadFile,
  readdir: mockReaddir,
}));

// ─── Mock child_process (spawn used by runCommand) ───────────────────────────
vi.mock("child_process", () => ({
  spawn: vi.fn(() => {
    const EventEmitter = require("events");
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    // Emit close with success by default
    setImmediate(() => proc.emit("close", 0));
    return proc;
  }),
}));

// ─── Mock ghl-assistant ───────────────────────────────────────────────────────
vi.mock("../ghl-assistant.js", () => ({
  askGhlAssistant: vi.fn().mockResolvedValue("2/2 notebooks responded\nMock GHL answer"),
}));

// ─── Mock openai ──────────────────────────────────────────────────────────────
vi.mock("openai", () => ({
  default: class OpenAI {
    constructor() {
      this.chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: "Mock OpenAI analysis" } }],
          }),
        },
      };
    }
  },
}));

import {
  getVeronicaConfig,
  getContext7Status,
  loadWorkflowCatalog,
  explainExistingWorkflows,
  diagnoseWorkflowIssue,
  explainWorkflowFile,
  debugWorkflowFile,
} from "../lib/veronica-agent.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setEnv(vars) {
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
}

function clearEnv() {
  ["CONTEXT7_API_KEY", "CONTEXT7_API_URL"].forEach((k) => delete process.env[k]);
}

function makeWorkflowJson(name = "Test Workflow") {
  return JSON.stringify({
    workflow_name: name,
    workflow_id: "wf-123",
    trigger_json: { event: "appointment_booked" },
    workflow_json: { workflowData: { templates: [] } },
  });
}

// ─── getVeronicaConfig ────────────────────────────────────────────────────────

describe("getVeronicaConfig", () => {
  beforeEach(clearEnv);
  afterEach(clearEnv);

  it("returns context7Connected=false when key not set", () => {
    const config = getVeronicaConfig();
    expect(config.context7Connected).toBe(false);
  });

  it("returns context7Connected=true when CONTEXT7_API_KEY set", () => {
    setEnv({ CONTEXT7_API_KEY: "ctx7-key" });
    const config = getVeronicaConfig();
    expect(config.context7Connected).toBe(true);
  });

  it("includes workflowsDir in config", () => {
    const config = getVeronicaConfig();
    expect(config.workflowsDir).toBeDefined();
    expect(config.workflowsDir).toContain("workflows");
  });

  it("includes feature description", () => {
    const config = getVeronicaConfig();
    expect(config.feature).toBeDefined();
    expect(typeof config.feature).toBe("string");
  });
});

// ─── getContext7Status — no API key ──────────────────────────────────────────

describe("getContext7Status — no API key", () => {
  beforeEach(clearEnv);
  afterEach(clearEnv);

  it("returns message about missing API key when CONTEXT7_API_KEY not set", async () => {
    const result = await getContext7Status();
    expect(result).toContain("API key missing");
  });
});

// Note: CONTEXT7_API_KEY is a module-level constant in veronica-agent.js.
// It is read at import time, so we can only test the no-key path here.
// The "with key" branch is covered by integration testing against a live Context7 API.

// ─── loadWorkflowCatalog ──────────────────────────────────────────────────────

// Helper: make Dirent-like objects for withFileTypes: true mocks
function makeFile(name) {
  return { name, isDirectory: () => false };
}
function makeDir(name) {
  return { name, isDirectory: () => true };
}

describe("loadWorkflowCatalog — empty/missing dir", () => {
  beforeEach(() => {
    mockReaddir.mockClear();
    mockReadFile.mockClear();
  });

  it("returns empty array when workflows dir does not exist", async () => {
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    const workflows = await loadWorkflowCatalog();
    expect(workflows).toEqual([]);
  });

  it("returns empty array when dir has no JSON files", async () => {
    mockReaddir.mockResolvedValue([makeFile("readme.txt"), makeFile("image.png")]);
    const workflows = await loadWorkflowCatalog();
    expect(workflows).toEqual([]);
  });
});

describe("loadWorkflowCatalog — with valid JSON files", () => {
  beforeEach(() => {
    mockReaddir.mockClear();
    mockReadFile.mockClear();
  });

  it("returns workflow entries for each JSON file", async () => {
    mockReaddir.mockResolvedValue([makeFile("treatment-booked.json"), makeFile("reminder.json")]);
    mockReadFile
      .mockResolvedValueOnce(makeWorkflowJson("Treatment Booked"))
      .mockResolvedValueOnce(makeWorkflowJson("Appointment Reminder"));

    const workflows = await loadWorkflowCatalog();
    expect(workflows).toHaveLength(2);
  });

  it("parses workflow name from JSON", async () => {
    mockReaddir.mockResolvedValue([makeFile("test-wf.json")]);
    mockReadFile.mockResolvedValue(makeWorkflowJson("My Test Workflow"));

    const [wf] = await loadWorkflowCatalog();
    expect(wf.workflowName).toBe("My Test Workflow");
  });

  it("falls back to filename when workflow_name missing", async () => {
    mockReaddir.mockResolvedValue([makeFile("no-name.json")]);
    mockReadFile.mockResolvedValue(JSON.stringify({ trigger_json: {} }));

    const [wf] = await loadWorkflowCatalog();
    expect(wf.workflowName).toBe("no-name");
  });

  it("sets triggerPresent=true when trigger_json exists", async () => {
    mockReaddir.mockResolvedValue([makeFile("wf.json")]);
    mockReadFile.mockResolvedValue(makeWorkflowJson());

    const [wf] = await loadWorkflowCatalog();
    expect(wf.triggerPresent).toBe(true);
  });

  it("sets triggerPresent=false when trigger_json missing", async () => {
    mockReaddir.mockResolvedValue([makeFile("wf.json")]);
    mockReadFile.mockResolvedValue(JSON.stringify({ workflow_name: "No Trigger" }));

    const [wf] = await loadWorkflowCatalog();
    expect(wf.triggerPresent).toBe(false);
  });

  it("skips malformed JSON files without throwing", async () => {
    mockReaddir.mockResolvedValue([makeFile("good.json"), makeFile("bad.json")]);
    mockReadFile
      .mockResolvedValueOnce(makeWorkflowJson("Good Workflow"))
      .mockResolvedValueOnce("this is { not valid json");

    const workflows = await loadWorkflowCatalog();
    expect(workflows).toHaveLength(1);
    expect(workflows[0].workflowName).toBe("Good Workflow");
  });
});

// ─── explainExistingWorkflows ─────────────────────────────────────────────────

describe("explainExistingWorkflows — empty catalog", () => {
  beforeEach(() => {
    mockReaddir.mockClear();
    mockReadFile.mockClear();
  });

  it("returns message prompting Echo export when no workflows found", async () => {
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    const result = await explainExistingWorkflows();
    expect(result).toContain("Echo");
  });

});

describe("explainExistingWorkflows — with workflows", () => {
  beforeEach(() => {
    mockReaddir.mockClear();
    mockReadFile.mockClear();
  });

  it("returns a string listing workflow names", async () => {
    mockReaddir.mockResolvedValue([makeFile("treatment.json"), makeFile("reminder.json")]);
    mockReadFile
      .mockResolvedValueOnce(makeWorkflowJson("Treatment Booked"))
      .mockResolvedValueOnce(makeWorkflowJson("Appointment Reminder"));

    const result = await explainExistingWorkflows();
    expect(result).toContain("Treatment Booked");
    expect(result).toContain("Appointment Reminder");
  });
});

// ─── diagnoseWorkflowIssue ────────────────────────────────────────────────────

describe("diagnoseWorkflowIssue — workflow not found", () => {
  beforeEach(() => {
    mockReaddir.mockClear();
    mockReadFile.mockClear();
  });

  it("returns 'workflow name not found' message when catalog is empty", async () => {
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    const result = await diagnoseWorkflowIssue("workflow not triggering");
    expect(result).toContain("Workflow");
  });

  it("returns helpful message when workflow name not matched", async () => {
    mockReaddir.mockResolvedValue([makeFile("treatment.json")]);
    mockReadFile.mockResolvedValue(makeWorkflowJson("Treatment Booked"));

    const result = await diagnoseWorkflowIssue("xyz unrelated issue");
    // Should return message about not finding workflow
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("diagnoseWorkflowIssue — workflow found", () => {
  beforeEach(() => {
    mockReaddir.mockClear();
    mockReadFile.mockClear();
    global.fetch = vi.fn().mockRejectedValue(new Error("Context7 unavailable"));
  });

  it("returns diagnosis string when workflow is matched by name", async () => {
    mockReaddir.mockResolvedValue([makeFile("treatment-booked.json")]);
    mockReadFile.mockResolvedValue(makeWorkflowJson("Treatment Booked"));

    const result = await diagnoseWorkflowIssue("trigger not firing", {
      workflowName: "Treatment Booked",
    });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes workflow name in response", async () => {
    mockReaddir.mockResolvedValue([makeFile("treatment-booked.json")]);
    mockReadFile.mockResolvedValue(makeWorkflowJson("Treatment Booked"));

    const result = await diagnoseWorkflowIssue("emails not sending", {
      workflowName: "Treatment Booked",
    });
    expect(result).toContain("Treatment Booked");
  });
});

// ─── explainWorkflowFile ──────────────────────────────────────────────────────

describe("explainWorkflowFile", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it("returns a string containing the workflow name", async () => {
    const parsedJson = JSON.parse(makeWorkflowJson("Nurtura Reminder"));
    const result = await explainWorkflowFile(parsedJson);
    expect(typeof result).toBe("string");
    expect(result).toContain("Nurtura Reminder");
  });

  it("includes NotebookLM section header", async () => {
    const parsedJson = JSON.parse(makeWorkflowJson("Test WF"));
    const result = await explainWorkflowFile(parsedJson);
    expect(result).toContain("NotebookLM");
  });

  it("includes AI Analysis section when OpenAI key is set", async () => {
    const parsedJson = JSON.parse(makeWorkflowJson("Test WF"));
    const result = await explainWorkflowFile(parsedJson);
    expect(result).toContain("AI Analysis");
  });

  it("falls back gracefully when workflow_name missing", async () => {
    const result = await explainWorkflowFile({});
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─── debugWorkflowFile ────────────────────────────────────────────────────────

describe("debugWorkflowFile", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it("returns a string containing Debug header", async () => {
    const parsedJson = JSON.parse(makeWorkflowJson("Payment Reminder"));
    const result = await debugWorkflowFile(parsedJson, "emails not sending");
    expect(typeof result).toBe("string");
    expect(result).toContain("Debug:");
    expect(result).toContain("Payment Reminder");
  });

  it("includes NotebookLM section header", async () => {
    const parsedJson = JSON.parse(makeWorkflowJson("Payment Reminder"));
    const result = await debugWorkflowFile(parsedJson);
    expect(result).toContain("NotebookLM");
  });

  it("includes AI Analysis section when OpenAI key is set", async () => {
    const parsedJson = JSON.parse(makeWorkflowJson("Payment Reminder"));
    const result = await debugWorkflowFile(parsedJson, "workflow not triggering");
    expect(result).toContain("AI Analysis");
  });

  it("works without userMessage argument", async () => {
    const parsedJson = JSON.parse(makeWorkflowJson("Silent Workflow"));
    const result = await debugWorkflowFile(parsedJson);
    expect(typeof result).toBe("string");
    expect(result).toContain("Silent Workflow");
  });
});
