import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/supabase.js", () => ({
  getSupabase: vi.fn(),
}));

import { getSupabase } from "../lib/supabase.js";
import {
  isValidStage,
  isValidTransition,
  moveLeadStage,
  getBoardData,
  getLeadDetail,
  addLeadNote,
  getPipelineStats,
  getDashConfig,
  STAGE_META,
} from "../lib/dash-agent.js";
import { PIPELINE_STAGES } from "../lib/iris-agent.js";

// ─── isValidStage ─────────────────────────────────────────────────────────────

describe("isValidStage", () => {
  it("returns true for all valid stages", () => {
    Object.values(PIPELINE_STAGES).forEach((s) => {
      expect(isValidStage(s)).toBe(true);
    });
  });

  it("returns false for unknown stage", () => {
    expect(isValidStage("random_stage")).toBe(false);
    expect(isValidStage("")).toBe(false);
    expect(isValidStage(null)).toBe(false);
    expect(isValidStage(undefined)).toBe(false);
  });
});

// ─── isValidTransition ────────────────────────────────────────────────────────

describe("isValidTransition", () => {
  it("new_lead → meeting_scheduled is valid", () => {
    expect(isValidTransition(PIPELINE_STAGES.NEW_LEAD, PIPELINE_STAGES.MEETING_SCHEDULED)).toBe(true);
  });

  it("meeting_scheduled → showed_up is valid", () => {
    expect(isValidTransition(PIPELINE_STAGES.MEETING_SCHEDULED, PIPELINE_STAGES.SHOWED_UP)).toBe(true);
  });

  it("meeting_scheduled → no_show is valid", () => {
    expect(isValidTransition(PIPELINE_STAGES.MEETING_SCHEDULED, PIPELINE_STAGES.NO_SHOW)).toBe(true);
  });

  it("showed_up → interested is valid", () => {
    expect(isValidTransition(PIPELINE_STAGES.SHOWED_UP, PIPELINE_STAGES.INTERESTED)).toBe(true);
  });

  it("interested → client_won is valid", () => {
    expect(isValidTransition(PIPELINE_STAGES.INTERESTED, PIPELINE_STAGES.CLIENT_WON)).toBe(true);
  });

  it("client_won → anything is invalid (terminal)", () => {
    Object.values(PIPELINE_STAGES).forEach((s) => {
      if (s !== PIPELINE_STAGES.CLIENT_WON) {
        expect(isValidTransition(PIPELINE_STAGES.CLIENT_WON, s)).toBe(false);
      }
    });
  });

  it("same stage → same stage is invalid", () => {
    expect(isValidTransition(PIPELINE_STAGES.NEW_LEAD, PIPELINE_STAGES.NEW_LEAD)).toBe(false);
  });

  it("returns false for unknown stages", () => {
    expect(isValidTransition("ghost", PIPELINE_STAGES.NEW_LEAD)).toBe(false);
    expect(isValidTransition(PIPELINE_STAGES.NEW_LEAD, "ghost")).toBe(false);
  });

  it("new_lead → client_won directly is invalid", () => {
    expect(isValidTransition(PIPELINE_STAGES.NEW_LEAD, PIPELINE_STAGES.CLIENT_WON)).toBe(false);
  });
});

// ─── moveLeadStage — no Supabase (dev fallback) ────────────────────────────────

describe("moveLeadStage — dev fallback (no Supabase)", () => {
  beforeEach(() => {
    getSupabase.mockReturnValue(null);
  });

  it("returns success with updated stage", async () => {
    const result = await moveLeadStage({
      leadId: "lead-1",
      toStage: PIPELINE_STAGES.MEETING_SCHEDULED,
    });
    expect(result.success).toBe(true);
    expect(result.lead.stage).toBe(PIPELINE_STAGES.MEETING_SCHEDULED);
  });

  it("returns followUpTrigger for stages that have one", async () => {
    const result = await moveLeadStage({
      leadId: "lead-1",
      toStage: PIPELINE_STAGES.NO_SHOW,
    });
    expect(result.followUpTrigger).toBe("no_show_reschedule");
  });

  it("returns null followUpTrigger for not_interested", async () => {
    const result = await moveLeadStage({
      leadId: "lead-1",
      toStage: PIPELINE_STAGES.NOT_INTERESTED,
    });
    expect(result.followUpTrigger).toBeNull();
  });

  it("throws when leadId missing", async () => {
    await expect(moveLeadStage({ toStage: PIPELINE_STAGES.SHOWED_UP })).rejects.toThrow("leadId is required");
  });

  it("throws on invalid toStage", async () => {
    await expect(
      moveLeadStage({ leadId: "lead-1", toStage: "fake_stage" })
    ).rejects.toThrow("Invalid stage");
  });
});

// ─── moveLeadStage — with Supabase mock ──────────────────────────────────────

describe("moveLeadStage — with mocked Supabase", () => {
  it("throws on invalid transition", async () => {
    const mockLead = { id: "lead-1", stage: PIPELINE_STAGES.NEW_LEAD };
    const mockSb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockLead, error: null }),
    };
    getSupabase.mockReturnValue(mockSb);

    await expect(
      moveLeadStage({ leadId: "lead-1", toStage: PIPELINE_STAGES.CLIENT_WON }) // new_lead → client_won invalid
    ).rejects.toThrow("Invalid transition");
  });

  it("calls update with correct stage and insert history", async () => {
    const mockLead = { id: "lead-1", stage: PIPELINE_STAGES.NEW_LEAD };
    const updateChain = {
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { ...mockLead, stage: PIPELINE_STAGES.MEETING_SCHEDULED },
        error: null,
      }),
    };
    const insertChain = { insert: vi.fn().mockResolvedValue({ error: null }) };

    const mockSb = {
      from: vi.fn((table) => {
        if (table === "agency_leads") return mockSb;
        return insertChain;
      }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn()
        .mockResolvedValueOnce({ data: mockLead, error: null }) // fetch current
        .mockResolvedValueOnce({ data: { ...mockLead, stage: PIPELINE_STAGES.MEETING_SCHEDULED }, error: null }), // after update
      update: vi.fn().mockReturnValue(updateChain),
    };
    getSupabase.mockReturnValue(mockSb);

    const result = await moveLeadStage({
      leadId: "lead-1",
      toStage: PIPELINE_STAGES.MEETING_SCHEDULED,
    });
    expect(result.success).toBe(true);
  });
});

// ─── getBoardData — no Supabase ───────────────────────────────────────────────

describe("getBoardData — dev fallback", () => {
  beforeEach(() => getSupabase.mockReturnValue(null));

  it("returns all stages with empty arrays", async () => {
    const board = await getBoardData();
    expect(board.totalCount).toBe(0);
    Object.values(PIPELINE_STAGES).forEach((s) => {
      expect(board.stages[s]).toEqual([]);
    });
  });
});

// ─── getPipelineStats ─────────────────────────────────────────────────────────

describe("getPipelineStats — no Supabase", () => {
  beforeEach(() => getSupabase.mockReturnValue(null));

  it("returns zeroed stats", async () => {
    const stats = await getPipelineStats();
    expect(stats.totalLeads).toBe(0);
    expect(stats.wonCount).toBe(0);
    expect(stats.conversionRate).toBe(0);
  });
});

// ─── addLeadNote ──────────────────────────────────────────────────────────────

describe("addLeadNote — validation", () => {
  beforeEach(() => getSupabase.mockReturnValue(null));

  it("throws when leadId missing", async () => {
    await expect(addLeadNote({ note: "test" })).rejects.toThrow("leadId is required");
  });

  it("throws when note is empty", async () => {
    await expect(addLeadNote({ leadId: "x", note: "" })).rejects.toThrow("note cannot be empty");
  });

  it("throws when note is whitespace only", async () => {
    await expect(addLeadNote({ leadId: "x", note: "   " })).rejects.toThrow("note cannot be empty");
  });

  it("succeeds in dev fallback (no Supabase)", async () => {
    const result = await addLeadNote({ leadId: "x", note: "Great lead" });
    expect(result.success).toBe(true);
  });
});

// ─── STAGE_META ───────────────────────────────────────────────────────────────

describe("STAGE_META", () => {
  it("every pipeline stage has meta entry", () => {
    Object.values(PIPELINE_STAGES).forEach((s) => {
      expect(STAGE_META[s]).toBeDefined();
      expect(STAGE_META[s].label).toBeTruthy();
      expect(STAGE_META[s].color).toMatch(/^#/);
      expect(typeof STAGE_META[s].order).toBe("number");
    });
  });

  it("client_won has onboarding_handoff trigger", () => {
    expect(STAGE_META[PIPELINE_STAGES.CLIENT_WON].triggerFollowUp).toBe("onboarding_handoff");
  });

  it("not_interested has no follow-up trigger", () => {
    expect(STAGE_META[PIPELINE_STAGES.NOT_INTERESTED].triggerFollowUp).toBeNull();
  });
});

// ─── getDashConfig ────────────────────────────────────────────────────────────

describe("getDashConfig", () => {
  it("returns stages array with id, label, color, order", () => {
    const config = getDashConfig();
    expect(Array.isArray(config.stages)).toBe(true);
    expect(config.stages.length).toBe(Object.values(PIPELINE_STAGES).length);
    config.stages.forEach((s) => {
      expect(s).toHaveProperty("id");
      expect(s).toHaveProperty("label");
      expect(s).toHaveProperty("color");
      expect(s).toHaveProperty("order");
    });
  });

  it("returns validTransitions object", () => {
    const config = getDashConfig();
    expect(config.validTransitions).toBeDefined();
    expect(Array.isArray(config.validTransitions[PIPELINE_STAGES.CLIENT_WON])).toBe(true);
    expect(config.validTransitions[PIPELINE_STAGES.CLIENT_WON]).toHaveLength(0);
  });
});
