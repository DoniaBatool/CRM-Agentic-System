import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock nodemailer ──────────────────────────────────────────────────────────
const { mockSendMail } = vi.hoisted(() => ({
  mockSendMail: vi.fn().mockResolvedValue({ messageId: "test-id" }),
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
  },
}));

import {
  sendEmail,
  sendWhatsApp,
  triggerSequence,
  getMaxConfig,
  SEQUENCES,
} from "../lib/max-agent.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setEnv(vars) {
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
}

function clearMaxEnv() {
  [
    "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_PORT",
    "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_NUMBER",
    "OWNER_EMAIL",
  ].forEach((k) => delete process.env[k]);
}

function mockFetchOk(body) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
  });
}

function mockFetchFail(status, message) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ message }),
  });
}

// ─── sendEmail ────────────────────────────────────────────────────────────────

describe("sendEmail — validation", () => {
  beforeEach(clearMaxEnv);

  it("throws when to is missing", async () => {
    await expect(sendEmail({ subject: "Hi", html: "<p>hello</p>" })).rejects.toThrow("to (email address) is required");
  });

  it("throws when subject is missing", async () => {
    await expect(sendEmail({ to: "x@y.com", html: "<p>hi</p>" })).rejects.toThrow("subject is required");
  });

  it("throws when both html and text are missing", async () => {
    await expect(sendEmail({ to: "x@y.com", subject: "Hi" })).rejects.toThrow("html or text body is required");
  });
});

describe("sendEmail — dev fallback (no SMTP)", () => {
  beforeEach(clearMaxEnv);

  it("returns sent=false in dev mode", async () => {
    const result = await sendEmail({ to: "dr@clinic.com", subject: "Hello", html: "<p>hi</p>" });
    expect(result.sent).toBe(false);
    expect(result.dev).toBe(true);
    expect(result.to).toBe("dr@clinic.com");
  });

  it("does not call nodemailer in dev mode", async () => {
    mockSendMail.mockClear();
    await sendEmail({ to: "x@y.com", subject: "Test", text: "body" });
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});

describe("sendEmail — with SMTP", () => {
  beforeEach(() => {
    clearMaxEnv();
    setEnv({ SMTP_HOST: "smtp-relay.brevo.com", SMTP_USER: "test@brevo.com", SMTP_PASS: "key123" });
    mockSendMail.mockClear().mockResolvedValue({ messageId: "msg-1" });
  });

  it("returns sent=true on success", async () => {
    const result = await sendEmail({ to: "dr@clinic.com", subject: "Test", html: "<p>hi</p>" });
    expect(result.sent).toBe(true);
    expect(result.to).toBe("dr@clinic.com");
  });

  it("calls nodemailer sendMail", async () => {
    await sendEmail({ to: "dr@clinic.com", subject: "Hello", html: "<p>hi</p>" });
    expect(mockSendMail).toHaveBeenCalledOnce();
    const call = mockSendMail.mock.calls[0][0];
    expect(call.to).toBe("dr@clinic.com");
    expect(call.subject).toBe("Hello");
  });

  it("includes fromName in from field", async () => {
    await sendEmail({ to: "x@y.com", subject: "Hi", html: "<p>hi</p>", fromName: "Donia" });
    const call = mockSendMail.mock.calls[0][0];
    expect(call.from).toContain("Donia");
  });
});

// ─── sendWhatsApp ─────────────────────────────────────────────────────────────

describe("sendWhatsApp — validation", () => {
  beforeEach(clearMaxEnv);

  it("throws when to is missing", async () => {
    await expect(sendWhatsApp({ message: "hi" })).rejects.toThrow("to (phone number) is required");
  });

  it("throws when message is missing", async () => {
    await expect(sendWhatsApp({ to: "+921234567890" })).rejects.toThrow("message is required");
  });
});

describe("sendWhatsApp — dev fallback (no Twilio)", () => {
  beforeEach(clearMaxEnv);

  it("returns sent=false in dev mode", async () => {
    const result = await sendWhatsApp({ to: "+921234567890", message: "Hello!" });
    expect(result.sent).toBe(false);
    expect(result.dev).toBe(true);
  });

  it("does not call fetch in dev mode", async () => {
    global.fetch = vi.fn();
    await sendWhatsApp({ to: "+921234567890", message: "hi" });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("sendWhatsApp — with Twilio", () => {
  beforeEach(() => {
    clearMaxEnv();
    setEnv({
      TWILIO_ACCOUNT_SID: "AC123",
      TWILIO_AUTH_TOKEN: "token123",
      TWILIO_WHATSAPP_NUMBER: "+14155551234",
    });
  });

  it("returns sent=true and sid on success", async () => {
    mockFetchOk({ sid: "SM123", status: "queued" });
    const result = await sendWhatsApp({ to: "+921234567890", message: "Hello!" });
    expect(result.sent).toBe(true);
    expect(result.sid).toBe("SM123");
  });

  it("sends to whatsapp: prefixed number", async () => {
    mockFetchOk({ sid: "SM456" });
    await sendWhatsApp({ to: "+921234567890", message: "hi" });
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toContain("AC123");
    const body = new URLSearchParams(opts.body);
    expect(body.get("To")).toBe("whatsapp:+921234567890");
    expect(body.get("From")).toBe("whatsapp:+14155551234");
  });

  it("throws on Twilio API error", async () => {
    mockFetchFail(400, "Invalid phone number");
    await expect(sendWhatsApp({ to: "bad-number", message: "hi" })).rejects.toThrow("Invalid phone number");
  });
});

// ─── triggerSequence ──────────────────────────────────────────────────────────

describe("triggerSequence — validation", () => {
  it("throws when trigger is missing", async () => {
    await expect(triggerSequence({ lead: {} })).rejects.toThrow("trigger name is required");
  });

  it("throws on unknown trigger", async () => {
    await expect(triggerSequence({ trigger: "ghost_sequence", lead: {} })).rejects.toThrow(
      'Unknown sequence: "ghost_sequence"'
    );
  });
});

describe("triggerSequence — dev fallback (no credentials)", () => {
  beforeEach(clearMaxEnv);

  const lead = {
    name: "Dr Ali",
    email: "ali@clinic.com",
    phone: "+921234567890",
    clinicName: "Ali Dental",
  };

  it("runs no_show_reschedule sequence", async () => {
    const result = await triggerSequence({ trigger: "no_show_reschedule", lead });
    expect(result.trigger).toBe("no_show_reschedule");
    expect(result.stepResults.length).toBeGreaterThan(0);
    // WhatsApp dev fallback
    const wa = result.stepResults.find((s) => s.channel === "whatsapp");
    expect(wa?.dev).toBe(true);
  });

  it("skips email step when no lead.email", async () => {
    const result = await triggerSequence({
      trigger: "post_meeting_follow_up",
      lead: { name: "Dr X", phone: "+921234567890" }, // no email
    });
    const emailStep = result.stepResults.find((s) => s.channel === "email");
    expect(emailStep?.skipped).toBe(true);
  });

  it("skips whatsapp step when no lead.phone", async () => {
    const result = await triggerSequence({
      trigger: "no_show_reschedule",
      lead: { name: "Dr X", email: "x@y.com" }, // no phone
    });
    const waStep = result.stepResults.find((s) => s.channel === "whatsapp");
    expect(waStep?.skipped).toBe(true);
  });

  it("returns successCount correctly", async () => {
    const result = await triggerSequence({ trigger: "no_show_reschedule", lead });
    expect(result.successCount).toBe(result.stepResults.filter((s) => s.dev || s.sent).length);
  });

  it("onboarding_handoff sends to OWNER_EMAIL not lead", async () => {
    setEnv({ OWNER_EMAIL: "donia@agency.com" });
    const result = await triggerSequence({ trigger: "onboarding_handoff", lead });
    const emailStep = result.stepResults.find((s) => s.channel === "email");
    // In dev mode (no SMTP), still returns to=OWNER_EMAIL
    expect(emailStep?.to).toBe("donia@agency.com");
  });

  it("onboarding_handoff skips email when OWNER_EMAIL not set", async () => {
    delete process.env.OWNER_EMAIL;
    const result = await triggerSequence({ trigger: "onboarding_handoff", lead });
    const emailStep = result.stepResults.find((s) => s.channel === "email");
    expect(emailStep?.skipped).toBe(true);
  });
});

// ─── SEQUENCES constant ───────────────────────────────────────────────────────

describe("SEQUENCES", () => {
  it("has all 6 expected sequences", () => {
    const keys = Object.keys(SEQUENCES);
    expect(keys).toContain("no_show_reschedule");
    expect(keys).toContain("pre_meeting_reminder");
    expect(keys).toContain("post_meeting_follow_up");
    expect(keys).toContain("interested_close_sequence");
    expect(keys).toContain("long_term_nurture");
    expect(keys).toContain("onboarding_handoff");
  });

  it("every sequence has name and steps", () => {
    Object.entries(SEQUENCES).forEach(([key, seq]) => {
      expect(seq.name).toBeTruthy();
      expect(Array.isArray(seq.steps)).toBe(true);
      expect(seq.steps.length).toBeGreaterThan(0);
    });
  });

  it("every step has a valid channel", () => {
    Object.values(SEQUENCES).forEach((seq) => {
      seq.steps.forEach((step) => {
        expect(["email", "whatsapp"]).toContain(step.channel);
      });
    });
  });
});

// ─── getMaxConfig ─────────────────────────────────────────────────────────────

describe("getMaxConfig", () => {
  it("returns emailConnected=false when SMTP not configured", () => {
    clearMaxEnv();
    const config = getMaxConfig();
    expect(config.emailConnected).toBe(false);
  });

  it("returns emailConnected=true when SMTP configured", () => {
    setEnv({ SMTP_HOST: "smtp.brevo.com", SMTP_USER: "u", SMTP_PASS: "p" });
    const config = getMaxConfig();
    expect(config.emailConnected).toBe(true);
  });

  it("returns whatsappConnected=false when Twilio not configured", () => {
    clearMaxEnv();
    const config = getMaxConfig();
    expect(config.whatsappConnected).toBe(false);
  });

  it("returns whatsappConnected=true when Twilio configured", () => {
    setEnv({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_WHATSAPP_NUMBER: "+1" });
    const config = getMaxConfig();
    expect(config.whatsappConnected).toBe(true);
  });

  it("lists all sequences with correct shape", () => {
    const config = getMaxConfig();
    expect(Array.isArray(config.sequences)).toBe(true);
    config.sequences.forEach((s) => {
      expect(s).toHaveProperty("trigger");
      expect(s).toHaveProperty("name");
      expect(s).toHaveProperty("steps");
      expect(Array.isArray(s.channels)).toBe(true);
    });
  });
});
