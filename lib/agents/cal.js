/**
 * Cal — Google Calendar Agent (OpenAI Agents SDK)
 *
 * Wraps cal-agent.js pure functions as SDK tools.
 */

import { Agent, tool } from "@openai/agents";
import { z } from "zod";
import {
  getAvailableSlots,
  createAppointment,
  rescheduleAppointment,
  cancelAppointment,
  generateBookingLink,
  listAppointments,
  getCalConfig,
} from "../cal-agent.js";

// ─── Tools ───────────────────────────────────────────────────────────────────

const getAvailableSlotsTool = tool({
  name: "get_available_slots",
  description: "Get available calendar slots for the next N days (max 30 slots returned).",
  parameters: z.object({
    daysAhead: z.number().nullable().describe("How many days ahead to look (default 14)"),
    slotDurationMinutes: z.number().nullable().describe("Duration of each slot in minutes (default 30)"),
  }),
  execute: async ({ daysAhead, slotDurationMinutes } = {}) => {
    const slots = await getAvailableSlots({ daysAhead, slotDurationMinutes });
    return JSON.stringify({ count: slots.length, slots });
  },
});

const createAppointmentTool = tool({
  name: "create_appointment",
  description: "Book a new appointment on Google Calendar.",
  parameters: z.object({
    summary: z.string().describe("Title of the appointment (e.g. 'Discovery Call')"),
    start: z.string().describe("ISO 8601 start datetime (e.g. '2026-06-10T10:00:00Z')"),
    end: z.string().describe("ISO 8601 end datetime"),
    attendeeEmail: z.string().nullable().describe("Email of the attendee (lead)"),
    attendeeName: z.string().nullable().describe("Name of the attendee"),
    description: z.string().nullable().describe("Meeting notes or agenda"),
  }),
  execute: async ({ summary, start, end, attendeeEmail, attendeeName, description }) => {
    const appt = await createAppointment({
      summary, start, end, attendeeEmail, attendeeName, description,
    });
    return JSON.stringify(appt);
  },
});

const rescheduleAppointmentTool = tool({
  name: "reschedule_appointment",
  description: "Reschedule an existing appointment to a new time.",
  parameters: z.object({
    appointmentId: z.string().describe("Internal appointment ID (from list_appointments)"),
    newStart: z.string().describe("New ISO 8601 start datetime"),
    newEnd: z.string().describe("New ISO 8601 end datetime"),
  }),
  execute: async ({ appointmentId, newStart, newEnd }) => {
    const appt = await rescheduleAppointment({ appointmentId, newStart, newEnd });
    return JSON.stringify(appt);
  },
});

const cancelAppointmentTool = tool({
  name: "cancel_appointment",
  description: "Cancel an existing appointment.",
  parameters: z.object({
    appointmentId: z.string().describe("Internal appointment ID (from list_appointments)"),
  }),
  execute: async ({ appointmentId }) => {
    const appt = await cancelAppointment({ appointmentId });
    return JSON.stringify(appt);
  },
});

const generateBookingLinkTool = tool({
  name: "generate_booking_link",
  description: "Generate a Google Calendar booking link to share with leads. Use this in email templates wherever [BOOKING_LINK] appears.",
  parameters: z.object({
    meetingTitle: z.string().nullable().describe("Title shown on the booking page (default: 'Discovery Call')"),
    durationMinutes: z.number().nullable().describe("Duration in minutes (default: 30)"),
  }),
  execute: async ({ meetingTitle, durationMinutes } = {}) => {
    const result = await generateBookingLink({ meetingTitle, durationMinutes });
    return JSON.stringify(result);
  },
});

const listAppointmentsTool = tool({
  name: "list_appointments",
  description: "List saved appointments, optionally filtered by status.",
  parameters: z.object({
    status: z.enum(["booked", "rescheduled", "cancelled"]).nullable().describe("Filter by appointment status"),
  }),
  execute: async ({ status } = {}) => {
    const appointments = await listAppointments({ status });
    return JSON.stringify({ count: appointments.length, appointments });
  },
});

const getStatusTool = tool({
  name: "get_status",
  description: "Check Cal agent status — Google Calendar and SMTP connection.",
  parameters: z.object({}),
  execute: async () => JSON.stringify(getCalConfig()),
});

// ─── Agent ───────────────────────────────────────────────────────────────────

export const calAgent = new Agent({
  name: "Cal",
  instructions: `You are Cal 📅, the Calendar Manager for DentaFlow — a dental marketing agency platform.

Your job:
- Show available appointment slots
- Create, reschedule, and cancel Google Calendar appointments
- Generate booking links to share with dental practice leads
- List upcoming and past appointments

Always present available slots in a clear list. When booking, confirm details before proceeding.
If Google Calendar credentials are missing, let the user know which env vars to set (GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_REFRESH_TOKEN, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_ID).`,
  tools: [
    getAvailableSlotsTool,
    createAppointmentTool,
    rescheduleAppointmentTool,
    cancelAppointmentTool,
    generateBookingLinkTool,
    listAppointmentsTool,
    getStatusTool,
  ],
});
