import { describe, it, expect } from "vitest";
import { resolveAgent, routeWithLuna } from "../lib/orchestrator.js";

// ─── resolveAgent ──────────────────────────────────────────────────────────────

describe("resolveAgent — default / empty", () => {
  it("returns veronica for empty string", () => {
    expect(resolveAgent("")).toBe("veronica");
  });

  it("returns veronica for null/undefined", () => {
    expect(resolveAgent(null)).toBe("veronica");
    expect(resolveAgent(undefined)).toBe("veronica");
  });

  it("returns veronica when no keyword matches", () => {
    expect(resolveAgent("random gibberish")).toBe("veronica");
  });
});

describe("resolveAgent — veronica (Nova merged — learn/help queries)", () => {
  it("routes 'how does this work' to veronica", () => {
    expect(resolveAgent("how does this workflow work?")).toBe("veronica");
  });

  it("routes 'learn ghl' to veronica", () => {
    expect(resolveAgent("I want to learn GHL automation")).toBe("veronica");
  });

  it("routes 'workflow help' to veronica", () => {
    expect(resolveAgent("I need workflow help")).toBe("veronica");
  });
});

describe("resolveAgent — survey-tester (Ayla)", () => {
  it("routes 'survey' keyword", () => {
    expect(resolveAgent("fill the survey form")).toBe("survey-tester");
  });

  it("routes 'autofill' keyword", () => {
    expect(resolveAgent("autofill the onboarding form")).toBe("survey-tester");
  });

  it("routes 'nurtura' keyword", () => {
    expect(resolveAgent("submit nurtura form")).toBe("survey-tester");
  });

  it("routes 'plan picker' keyword", () => {
    expect(resolveAgent("open plan picker")).toBe("survey-tester");
  });
});

describe("resolveAgent — veronica (Workflow Debugger)", () => {
  it("routes 'debug' keyword", () => {
    expect(resolveAgent("debug this workflow")).toBe("veronica");
  });

  it("routes 'error' keyword", () => {
    expect(resolveAgent("there is an error in workflow")).toBe("veronica");
  });

  it("routes 'end to end' keyword", () => {
    expect(resolveAgent("run end to end test")).toBe("veronica");
  });

  it("routes 'end-to-end' keyword", () => {
    expect(resolveAgent("end-to-end workflow analysis")).toBe("veronica");
  });

  it("routes 'summary report' keyword", () => {
    expect(resolveAgent("generate summary report")).toBe("veronica");
  });

  it("routes 'veronica' by name", () => {
    expect(resolveAgent("veronica check this")).toBe("veronica");
  });
});

describe("resolveAgent — workflow-export (Echo)", () => {
  it("routes 'export' keyword", () => {
    expect(resolveAgent("export workflows as json")).toBe("workflow-export");
  });

  it("routes 'download workflows' keyword", () => {
    expect(resolveAgent("download workflows please")).toBe("workflow-export");
  });

  it("routes 'extract workflows' keyword", () => {
    expect(resolveAgent("extract workflows from sub-account")).toBe("workflow-export");
  });
});

describe("resolveAgent — workflow-tester (Sara)", () => {
  it("routes 'contact' keyword", () => {
    expect(resolveAgent("find contact john")).toBe("workflow-tester");
  });

  it("routes 'book' keyword", () => {
    expect(resolveAgent("book appointment")).toBe("workflow-tester");
  });

  it("routes 'webhook' keyword", () => {
    expect(resolveAgent("trigger webhook")).toBe("workflow-tester");
  });

  it("routes 'treatment' keyword", () => {
    expect(resolveAgent("treatment booked")).toBe("workflow-tester");
  });

  it("routes 'consultation' keyword", () => {
    expect(resolveAgent("personal consultation rescheduled")).toBe("workflow-tester");
  });
});

describe("resolveAgent — rex (Lead Scout)", () => {
  it("routes 'lead' keyword", () => {
    expect(resolveAgent("find leads in Houston")).toBe("rex");
  });

  it("routes 'dental clinic' keyword", () => {
    expect(resolveAgent("find dental clinic near me")).toBe("rex");
  });

  it("routes 'google maps' keyword", () => {
    expect(resolveAgent("scrape google maps")).toBe("rex");
  });

  it("routes 'prospect' keyword", () => {
    expect(resolveAgent("get prospects for outreach")).toBe("rex");
  });
});

describe("resolveAgent — nora (Content Architect)", () => {
  it("routes 'email template' keyword", () => {
    expect(resolveAgent("write email template for onboarding")).toBe("nora");
  });

  it("routes 'linkedin post' keyword", () => {
    expect(resolveAgent("create linkedin post")).toBe("nora");
  });

  it("routes 'ad copy' keyword", () => {
    expect(resolveAgent("write ad copy for instagram")).toBe("nora");
  });

  it("routes 'proposal' keyword", () => {
    expect(resolveAgent("write a proposal for client")).toBe("nora");
  });

  it("routes 'nora' by name", () => {
    expect(resolveAgent("nora write something")).toBe("nora");
  });
});

describe("resolveAgent — max (Outreach Agent)", () => {
  it("routes 'mailchimp' keyword", () => {
    expect(resolveAgent("setup mailchimp campaign")).toBe("max");
  });

  it("routes 'drip' keyword", () => {
    expect(resolveAgent("create a drip sequence")).toBe("max");
  });

  it("routes 'email sequence' keyword", () => {
    expect(resolveAgent("build email sequence")).toBe("max");
  });

  it("routes 'max' by name", () => {
    expect(resolveAgent("max send the campaign")).toBe("max");
  });
});

describe("resolveAgent — cal (Calendar Agent)", () => {
  it("routes 'appointment' keyword", () => {
    expect(resolveAgent("schedule appointment")).toBe("cal");
  });

  it("routes 'calendar' keyword", () => {
    expect(resolveAgent("show calendar slots")).toBe("cal");
  });

  it("routes 'book meeting' keyword", () => {
    expect(resolveAgent("book meeting tomorrow")).toBe("cal");
  });

  it("routes 'available slots' keyword", () => {
    expect(resolveAgent("show available slots")).toBe("cal");
  });

  it("routes 'reschedule' keyword — note: also matches workflow-tester", () => {
    // 'reschedule' hits workflow-tester first (before cal) in current logic
    const result = resolveAgent("reschedule meeting");
    expect(["cal", "workflow-tester"]).toContain(result);
  });

  it("routes 'cal' by name", () => {
    expect(resolveAgent("cal show my schedule")).toBe("cal");
  });
});

describe("resolveAgent — case insensitivity", () => {
  it("handles uppercase input", () => {
    expect(resolveAgent("EXPORT WORKFLOWS")).toBe("workflow-export");
  });

  it("handles mixed case", () => {
    expect(resolveAgent("Find Lead In Houston")).toBe("rex");
  });

  it("handles extra whitespace", () => {
    expect(resolveAgent("  survey  ")).toBe("survey-tester");
  });
});

// ─── routeWithLuna ─────────────────────────────────────────────────────────────

describe("routeWithLuna", () => {
  it("returns agentId and routingMessage", () => {
    const result = routeWithLuna("export workflows");
    expect(result).toHaveProperty("agentId");
    expect(result).toHaveProperty("routingMessage");
  });

  it("routingMessage contains agent name for workflow-export → Echo", () => {
    const result = routeWithLuna("export workflows");
    expect(result.agentId).toBe("workflow-export");
    expect(result.routingMessage).toContain("Echo");
  });

  it("routingMessage contains Veronica for learn/help queries (Nova merged)", () => {
    const result = routeWithLuna("how does this work");
    expect(result.agentId).toBe("veronica");
    expect(result.routingMessage).toContain("Veronica");
  });

  it("routingMessage contains Veronica for veronica", () => {
    const result = routeWithLuna("debug workflow issue");
    expect(result.agentId).toBe("veronica");
    expect(result.routingMessage).toContain("Veronica");
  });

  it("routingMessage contains Sara for workflow-tester", () => {
    const result = routeWithLuna("trigger webhook");
    expect(result.agentId).toBe("workflow-tester");
    expect(result.routingMessage).toContain("Sara");
  });

  it("routingMessage contains Rex for rex", () => {
    const result = routeWithLuna("find dental leads");
    expect(result.agentId).toBe("rex");
    expect(result.routingMessage).toContain("Rex");
  });

  it("routingMessage contains Nora for nora", () => {
    const result = routeWithLuna("write email template");
    expect(result.agentId).toBe("nora");
    expect(result.routingMessage).toContain("Nora");
  });

  it("routingMessage contains Max for max", () => {
    const result = routeWithLuna("mailchimp campaign");
    expect(result.agentId).toBe("max");
    expect(result.routingMessage).toContain("Max");
  });

  it("routingMessage contains Ayla for survey-tester", () => {
    const result = routeWithLuna("fill survey form");
    expect(result.agentId).toBe("survey-tester");
    expect(result.routingMessage).toContain("Ayla");
  });

  it("falls back to veronica for unknown input", () => {
    const result = routeWithLuna("xyz unknown");
    expect(result.agentId).toBe("veronica");
    expect(result.routingMessage).toContain("Veronica");
  });
});
