import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoist fs mocks so vi.mock factory can reference them ─────────────────────
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

// ─── Mock nodemailer (notification is best-effort) ───────────────────────────
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn().mockResolvedValue({}),
    })),
  },
}));

import {
  refreshAccessToken,
  getAvailableSlots,
  createAppointment,
  rescheduleAppointment,
  cancelAppointment,
  generateBookingLink,
  listAppointments,
} from "../lib/cal-agent.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function setEnv(vars) {
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
}

function clearCalEnv() {
  [
    "GOOGLE_CALENDAR_ACCESS_TOKEN",
    "GOOGLE_CALENDAR_REFRESH_TOKEN",
    "GOOGLE_CALENDAR_CLIENT_ID",
    "GOOGLE_CALENDAR_CLIENT_SECRET",
    "GOOGLE_CALENDAR_ID",
    "OWNER_EMAIL",
  ].forEach((k) => delete process.env[k]);
}

function mockEmptyAppts() {
  mockReadFile.mockRejectedValue(new Error("not found"));
}

function mockAppts(list) {
  mockReadFile.mockResolvedValue(JSON.stringify({ appointments: list }));
}

// ─── refreshAccessToken ───────────────────────────────────────────────────────

describe("refreshAccessToken", () => {
  beforeEach(clearCalEnv);

  it("throws when refresh token missing", async () => {
    await expect(refreshAccessToken()).rejects.toThrow("Google Calendar OAuth credentials missing");
  });

  it("throws when clientId missing", async () => {
    setEnv({ GOOGLE_CALENDAR_REFRESH_TOKEN: "rtoken", GOOGLE_CALENDAR_CLIENT_SECRET: "secret" });
    await expect(refreshAccessToken()).rejects.toThrow("Google Calendar OAuth credentials missing");
  });

  it("sets GOOGLE_CALENDAR_ACCESS_TOKEN on success", async () => {
    setEnv({
      GOOGLE_CALENDAR_REFRESH_TOKEN: "rtoken",
      GOOGLE_CALENDAR_CLIENT_ID: "cid",
      GOOGLE_CALENDAR_CLIENT_SECRET: "csecret",
    });
    mockFetchOk({ access_token: "new-access-token" });

    const token = await refreshAccessToken();
    expect(token).toBe("new-access-token");
    expect(process.env.GOOGLE_CALENDAR_ACCESS_TOKEN).toBe("new-access-token");
  });

  it("throws on token endpoint error", async () => {
    setEnv({
      GOOGLE_CALENDAR_REFRESH_TOKEN: "rtoken",
      GOOGLE_CALENDAR_CLIENT_ID: "cid",
      GOOGLE_CALENDAR_CLIENT_SECRET: "csecret",
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "invalid_grant", error_description: "Token expired" }),
    });

    await expect(refreshAccessToken()).rejects.toThrow("Token refresh failed: Token expired");
  });
});

// ─── getAvailableSlots ────────────────────────────────────────────────────────

describe("getAvailableSlots", () => {
  beforeEach(() => {
    clearCalEnv();
    setEnv({ GOOGLE_CALENDAR_ACCESS_TOKEN: "test-token", GOOGLE_CALENDAR_ID: "primary" });
  });

  it("fails gracefully when no credentials at all (tries token refresh)", async () => {
    clearCalEnv(); // no token, no refresh creds either
    // Without access token, it will try refresh → fail with OAuth credentials missing
    await expect(getAvailableSlots()).rejects.toThrow(/credentials missing|ACCESS_TOKEN missing/i);
  });

  it("returns array of slots when calendar is empty", async () => {
    mockFetchOk({ calendars: { primary: { busy: [] } } });
    // daysAhead: 7 ensures we always cover weekdays regardless of what day today is
    const slots = await getAvailableSlots({ daysAhead: 7 });
    expect(Array.isArray(slots)).toBe(true);
    expect(slots.length).toBeGreaterThan(0);
  });

  it("each slot has start, end, label", async () => {
    mockFetchOk({ calendars: { primary: { busy: [] } } });
    const slots = await getAvailableSlots({ daysAhead: 1 });
    if (slots.length > 0) {
      expect(slots[0]).toHaveProperty("start");
      expect(slots[0]).toHaveProperty("end");
      expect(slots[0]).toHaveProperty("label");
    }
  });

  it("excludes busy time slots", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const busyEnd = new Date(tomorrow.getTime() + 10 * 60 * 60 * 1000);

    mockFetchOk({
      calendars: {
        primary: {
          busy: [{ start: tomorrow.toISOString(), end: busyEnd.toISOString() }],
        },
      },
    });

    const slots = await getAvailableSlots({ daysAhead: 1 });
    slots.forEach((s) => {
      const start = new Date(s.start);
      expect(start.toDateString()).not.toBe(tomorrow.toDateString());
    });
  });

  it("returns max 30 slots", async () => {
    mockFetchOk({ calendars: { primary: { busy: [] } } });
    const slots = await getAvailableSlots({ daysAhead: 60 });
    expect(slots.length).toBeLessThanOrEqual(30);
  });

  it("retries after 401 by refreshing token", async () => {
    setEnv({
      GOOGLE_CALENDAR_REFRESH_TOKEN: "rtoken",
      GOOGLE_CALENDAR_CLIENT_ID: "cid",
      GOOGLE_CALENDAR_CLIENT_SECRET: "csecret",
    });

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { message: "401 Unauthorized" } }),
      })
      .mockResolvedValueOnce({ // token refresh
        ok: true,
        json: () => Promise.resolve({ access_token: "new-token" }),
      })
      .mockResolvedValueOnce({ // retry
        ok: true,
        json: () => Promise.resolve({ calendars: { primary: { busy: [] } } }),
      });

    const slots = await getAvailableSlots({ daysAhead: 1 });
    expect(Array.isArray(slots)).toBe(true);
  });
});

// ─── createAppointment ────────────────────────────────────────────────────────

describe("createAppointment", () => {
  beforeEach(() => {
    clearCalEnv();
    setEnv({ GOOGLE_CALENDAR_ACCESS_TOKEN: "test-token", GOOGLE_CALENDAR_ID: "primary" });
    mockEmptyAppts();
    mockWriteFile.mockClear();
  });

  it("fails gracefully when no credentials (tries token refresh)", async () => {
    clearCalEnv();
    await expect(
      createAppointment({ summary: "Call", start: "2026-06-10T10:00:00Z", end: "2026-06-10T10:30:00Z" })
    ).rejects.toThrow(/credentials missing|ACCESS_TOKEN missing/i);
  });

  it("returns appointment object on success", async () => {
    mockFetchOk({
      id: "gcal-event-1",
      summary: "Discovery Call",
      htmlLink: "https://calendar.google.com/event?id=1",
    });

    const appt = await createAppointment({
      summary: "Discovery Call",
      start: "2026-06-10T10:00:00Z",
      end: "2026-06-10T10:30:00Z",
      attendeeEmail: "dr.ali@clinic.com",
      attendeeName: "Dr Ali",
    });

    expect(appt.id).toBe("gcal-event-1");
    expect(appt.summary).toBe("Discovery Call");
    expect(appt.status).toBe("booked");
    expect(appt.attendeeEmail).toBe("dr.ali@clinic.com");
    expect(appt.htmlLink).toBeDefined();
  });

  it("saves appointment to local file", async () => {
    mockFetchOk({ id: "gcal-1", summary: "Call", htmlLink: "" });

    await createAppointment({
      summary: "Call",
      start: "2026-06-10T10:00:00Z",
      end: "2026-06-10T10:30:00Z",
    });

    expect(mockWriteFile).toHaveBeenCalled();
    const written = JSON.parse(mockWriteFile.mock.calls.at(-1)[1]);
    expect(written.appointments.length).toBe(1);
    expect(written.appointments[0].status).toBe("booked");
  });

  it("throws on Google Calendar API error", async () => {
    mockFetchFail(400, "Invalid request");
    await expect(
      createAppointment({ summary: "X", start: "bad", end: "bad" })
    ).rejects.toThrow("Invalid request");
  });
});

// ─── rescheduleAppointment ────────────────────────────────────────────────────

describe("rescheduleAppointment", () => {
  const existingAppt = {
    id: "appt-1",
    googleEventId: "gcal-1",
    summary: "Discovery Call",
    start: "2026-06-10T10:00:00Z",
    end: "2026-06-10T10:30:00Z",
    attendeeEmail: "dr@clinic.com",
    status: "booked",
  };

  beforeEach(() => {
    clearCalEnv();
    setEnv({ GOOGLE_CALENDAR_ACCESS_TOKEN: "test-token", GOOGLE_CALENDAR_ID: "primary" });
    mockAppts([existingAppt]);
    mockWriteFile.mockClear();
  });

  it("throws when appointment not found", async () => {
    await expect(
      rescheduleAppointment({
        appointmentId: "nonexistent",
        newStart: "2026-06-11T10:00:00Z",
        newEnd: "2026-06-11T10:30:00Z",
      })
    ).rejects.toThrow("Appointment nonexistent not found");
  });

  it("updates start, end and status", async () => {
    mockFetchOk({});

    const appt = await rescheduleAppointment({
      appointmentId: "appt-1",
      newStart: "2026-06-11T14:00:00Z",
      newEnd: "2026-06-11T14:30:00Z",
    });

    expect(appt.start).toBe("2026-06-11T14:00:00Z");
    expect(appt.status).toBe("rescheduled");
    expect(appt.previousStart).toBe("2026-06-10T10:00:00Z");
  });

  it("persists rescheduled state to file", async () => {
    mockFetchOk({});
    await rescheduleAppointment({
      appointmentId: "appt-1",
      newStart: "2026-06-11T14:00:00Z",
      newEnd: "2026-06-11T14:30:00Z",
    });
    expect(mockWriteFile).toHaveBeenCalled();
  });
});

// ─── cancelAppointment ────────────────────────────────────────────────────────

describe("cancelAppointment", () => {
  const existingAppt = {
    id: "appt-2",
    googleEventId: "gcal-2",
    summary: "Strategy Session",
    start: "2026-06-12T11:00:00Z",
    end: "2026-06-12T11:30:00Z",
    status: "booked",
  };

  beforeEach(() => {
    clearCalEnv();
    setEnv({ GOOGLE_CALENDAR_ACCESS_TOKEN: "test-token", GOOGLE_CALENDAR_ID: "primary" });
    mockAppts([existingAppt]);
    mockWriteFile.mockClear();
  });

  it("throws when appointment not found", async () => {
    await expect(cancelAppointment({ appointmentId: "ghost" })).rejects.toThrow(
      "Appointment ghost not found"
    );
  });

  it("marks status as cancelled", async () => {
    mockFetchOk({});
    const appt = await cancelAppointment({ appointmentId: "appt-2" });
    expect(appt.status).toBe("cancelled");
    expect(appt.cancelledAt).toBeDefined();
  });

  it("continues even if Google Calendar DELETE fails", async () => {
    // First read succeeds (already set via mockAppts), DELETE fails gracefully
    global.fetch = vi.fn().mockRejectedValue(new Error("network error"));
    const appt = await cancelAppointment({ appointmentId: "appt-2" });
    expect(appt.status).toBe("cancelled");
  });
});

// ─── generateBookingLink ──────────────────────────────────────────────────────

describe("generateBookingLink", () => {
  it("returns a booking link and instruction", async () => {
    const result = await generateBookingLink({ meetingTitle: "Demo Call", durationMinutes: 30 });
    expect(result.bookingLink).toContain("calendar.google.com");
    expect(result.bookingLink).toContain("Demo%20Call");
    expect(result.instruction).toBeTruthy();
  });

  it("uses defaults when no args provided", async () => {
    const result = await generateBookingLink();
    expect(result.bookingLink).toContain("Discovery%20Call");
  });

  it("encodes special characters in meeting title", async () => {
    const result = await generateBookingLink({ meetingTitle: "Q&A Session", durationMinutes: 45 });
    expect(result.bookingLink).toContain(encodeURIComponent("Q&A Session"));
  });
});

// ─── listAppointments ─────────────────────────────────────────────────────────

describe("listAppointments", () => {
  const appointments = [
    { id: "1", status: "booked", summary: "A" },
    { id: "2", status: "rescheduled", summary: "B" },
    { id: "3", status: "cancelled", summary: "C" },
    { id: "4", status: "booked", summary: "D" },
  ];

  beforeEach(() => {
    mockAppts(appointments);
  });

  it("returns all appointments when no filter", async () => {
    const result = await listAppointments();
    expect(result).toHaveLength(4);
  });

  it("filters by status=booked", async () => {
    const result = await listAppointments({ status: "booked" });
    expect(result).toHaveLength(2);
    result.forEach((a) => expect(a.status).toBe("booked"));
  });

  it("filters by status=cancelled", async () => {
    const result = await listAppointments({ status: "cancelled" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("3");
  });

  it("returns empty array when file does not exist", async () => {
    mockReadFile.mockRejectedValue(new Error("not found"));
    const result = await listAppointments();
    expect(result).toEqual([]);
  });
});
