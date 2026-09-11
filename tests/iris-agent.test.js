import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase before import
vi.mock("../lib/supabase.js", () => ({
  getSupabase: vi.fn(),
}));

import { getSupabase } from "../lib/supabase.js";
import {
  normalizeLead,
  processIntake,
  findExistingLead,
  saveLead,
  getRecentLeads,
  getPipelineCounts,
  getIrisConfig,
  PIPELINE_STAGES,
  INTAKE_SOURCES,
} from "../lib/iris-agent.js";

// ─── normalizeLead ────────────────────────────────────────────────────────────

describe("normalizeLead — valid inputs", () => {
  it("accepts minimal valid survey payload", () => {
    const { valid, lead } = normalizeLead({ name: "Dr Ali", email: "ali@clinic.com", source: "survey" });
    expect(valid).toBe(true);
    expect(lead.name).toBe("Dr Ali");
    expect(lead.email).toBe("ali@clinic.com");
    expect(lead.stage).toBe(PIPELINE_STAGES.NEW_LEAD);
  });

  it("accepts payload with phone only (no email)", () => {
    const { valid } = normalizeLead({ name: "Dr Sara", phone: "+923001234567" });
    expect(valid).toBe(true);
  });

  it("sets stage to meeting_scheduled for calendar_booking source", () => {
    const { valid, lead } = normalizeLead({
      name: "Dr Khan",
      email: "khan@clinic.com",
      source: INTAKE_SOURCES.CALENDAR_BOOKING,
      meeting_datetime: "2026-06-10T10:00:00Z",
    });
    expect(valid).toBe(true);
    expect(lead.stage).toBe(PIPELINE_STAGES.MEETING_SCHEDULED);
  });

  it("normalizes email to lowercase", () => {
    const { lead } = normalizeLead({ name: "Dr X", email: "Dr.X@CLINIC.COM" });
    expect(lead.email).toBe("dr.x@clinic.com");
  });

  it("trims whitespace from name", () => {
    const { lead } = normalizeLead({ name: "  Dr Ali  ", email: "ali@test.com" });
    expect(lead.name).toBe("Dr Ali");
  });

  it("accepts alternate field names: full_name, contact_email", () => {
    const { valid, lead } = normalizeLead({ full_name: "Dr Zara", contact_email: "zara@dental.com" });
    expect(valid).toBe(true);
    expect(lead.name).toBe("Dr Zara");
    expect(lead.email).toBe("zara@dental.com");
  });

  it("accepts alternate field: business_name for clinic_name", () => {
    const { lead } = normalizeLead({ name: "Dr X", email: "x@y.com", business_name: "Smile Clinic" });
    expect(lead.clinic_name).toBe("Smile Clinic");
  });

  it("removes phone formatting characters", () => {
    const { lead } = normalizeLead({ name: "Dr X", phone: "+92 300-123 4567" });
    expect(lead.phone).toBe("+923001234567");
  });

  it("sets created_at as ISO string", () => {
    const { lead } = normalizeLead({ name: "Dr X", email: "x@y.com" });
    expect(() => new Date(lead.created_at)).not.toThrow();
  });
});

describe("normalizeLead — validation errors", () => {
  it("fails when name is missing", () => {
    const { valid, errors } = normalizeLead({ email: "x@y.com" });
    expect(valid).toBe(false);
    expect(errors).toContain("name is required");
  });

  it("fails when both email and phone are missing", () => {
    const { valid, errors } = normalizeLead({ name: "Dr X" });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("email or phone"))).toBe(true);
  });

  it("fails on invalid email format", () => {
    const { valid, errors } = normalizeLead({ name: "Dr X", email: "not-an-email" });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("invalid email format"))).toBe(true);
  });

  it("fails on calendar_booking without meeting_datetime", () => {
    const { valid, errors } = normalizeLead({
      name: "Dr X",
      email: "x@y.com",
      source: INTAKE_SOURCES.CALENDAR_BOOKING,
    });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("meeting_datetime"))).toBe(true);
  });

  it("fails on empty payload", () => {
    const { valid } = normalizeLead({});
    expect(valid).toBe(false);
  });

  it("returns all errors at once (not just first)", () => {
    const { errors } = normalizeLead({});
    expect(errors.length).toBeGreaterThan(1);
  });
});

// ─── processIntake ────────────────────────────────────────────────────────────

describe("processIntake — no Supabase (dev fallback)", () => {
  beforeEach(() => {
    getSupabase.mockReturnValue(null); // simulate no DB
  });

  it("returns success with local id when Supabase not connected", async () => {
    const result = await processIntake({ name: "Dr Ali", email: "ali@dental.com" });
    expect(result.success).toBe(true);
    expect(result.leadId).toMatch(/^local-/);
    expect(result.isNew).toBe(true);
  });

  it("returns success=false on invalid payload", async () => {
    const result = await processIntake({ email: "x@y.com" }); // missing name
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it("returns correct stage for survey source", async () => {
    const result = await processIntake({ name: "Dr X", email: "x@y.com", source: "survey" });
    expect(result.stage).toBe(PIPELINE_STAGES.NEW_LEAD);
  });

  it("returns meeting_scheduled stage for calendar booking", async () => {
    const result = await processIntake({
      name: "Dr X",
      email: "x@y.com",
      source: INTAKE_SOURCES.CALENDAR_BOOKING,
      meeting_datetime: "2026-06-10T10:00:00Z",
    });
    expect(result.stage).toBe(PIPELINE_STAGES.MEETING_SCHEDULED);
  });

  it("returns lead object in result", async () => {
    const result = await processIntake({ name: "Dr Zara", phone: "+923001234567" });
    expect(result.lead).toBeDefined();
    expect(result.lead.name).toBe("Dr Zara");
  });
});

// ─── saveLead — with Supabase mock ────────────────────────────────────────────

describe("saveLead — with mocked Supabase", () => {
  const mockLead = { name: "Dr Ali", email: "ali@dental.com", phone: "+1", stage: "new_lead", source: "survey" };

  it("inserts new lead and returns isNew=true", async () => {
    const mockSb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [] }),      // no duplicate found
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { ...mockLead, id: "uuid-1" }, error: null }),
    };
    getSupabase.mockReturnValue(mockSb);

    // findExistingLead → no match
    mockSb.limit.mockResolvedValue({ data: [] });

    // insert → success
    const insertChain = { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { ...mockLead, id: "uuid-1" }, error: null }) };
    mockSb.insert.mockReturnValue(insertChain);

    const result = await saveLead(mockLead);
    expect(result.isNew).toBe(true);
    expect(result.leadId).toBe("uuid-1");
  });

  it("returns isNew=false when duplicate email found", async () => {
    const existing = { ...mockLead, id: "existing-uuid", stage: "new_lead" };
    const mockSb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [existing] }),
    };
    getSupabase.mockReturnValue(mockSb);

    const result = await saveLead(mockLead);
    expect(result.isNew).toBe(false);
    expect(result.leadId).toBe("existing-uuid");
  });
});

// ─── getIrisConfig ────────────────────────────────────────────────────────────

describe("getIrisConfig", () => {
  it("returns stages array", () => {
    getSupabase.mockReturnValue(null);
    const config = getIrisConfig();
    expect(Array.isArray(config.stages)).toBe(true);
    expect(config.stages).toContain(PIPELINE_STAGES.NEW_LEAD);
    expect(config.stages).toContain(PIPELINE_STAGES.CLIENT_WON);
  });

  it("returns sources array", () => {
    const config = getIrisConfig();
    expect(config.sources).toContain(INTAKE_SOURCES.SURVEY);
    expect(config.sources).toContain(INTAKE_SOURCES.CALENDAR_BOOKING);
  });

  it("supabaseConnected is false when Supabase not configured", () => {
    getSupabase.mockReturnValue(null);
    const config = getIrisConfig();
    expect(config.supabaseConnected).toBe(false);
  });

  it("supabaseConnected is true when Supabase configured", () => {
    getSupabase.mockReturnValue({ from: vi.fn() });
    const config = getIrisConfig();
    expect(config.supabaseConnected).toBe(true);
  });
});

// ─── PIPELINE_STAGES constants ────────────────────────────────────────────────

describe("PIPELINE_STAGES", () => {
  it("has all 8 expected stages", () => {
    const stages = Object.values(PIPELINE_STAGES);
    expect(stages).toHaveLength(8);
    expect(stages).toContain("new_lead");
    expect(stages).toContain("meeting_scheduled");
    expect(stages).toContain("showed_up");
    expect(stages).toContain("no_show");
    expect(stages).toContain("interested");
    expect(stages).toContain("not_interested");
    expect(stages).toContain("long_term_follow_up");
    expect(stages).toContain("client_won");
  });
});
