import fs from "fs/promises";
import path from "path";

const APPTS_FILE = path.join(process.cwd(), "data", "cal-appointments.json");

async function readAppts() {
  try {
    const raw = await fs.readFile(APPTS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { appointments: [] };
  }
}

async function writeAppts(data) {
  await fs.mkdir(path.dirname(APPTS_FILE), { recursive: true });
  await fs.writeFile(APPTS_FILE, JSON.stringify(data, null, 2));
}

function gcalHeaders() {
  const token = process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;
  if (!token) throw new Error("GOOGLE_CALENDAR_ACCESS_TOKEN missing in .env");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const CALENDAR_ID = () => process.env.GOOGLE_CALENDAR_ID || "primary";

async function gcalFetch(path, options = {}) {
  const base = "https://www.googleapis.com/calendar/v3";
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { ...gcalHeaders(), ...(options.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Google Calendar ${options.method || "GET"} ${path}: ${json.error?.message || res.status}`
    );
  }
  return json;
}

// ─── Refresh access token using refresh token ──────────────────────────────────

export async function refreshAccessToken() {
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error(
      "Google Calendar OAuth credentials missing. Set GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_REFRESH_TOKEN in .env"
    );
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${json.error_description || json.error}`);

  process.env.GOOGLE_CALENDAR_ACCESS_TOKEN = json.access_token;
  return json.access_token;
}

async function callWithTokenRefresh(fn) {
  try {
    return await fn();
  } catch (err) {
    if (
      err.message?.includes("401") ||
      err.message?.includes("Invalid Credentials") ||
      err.message?.includes("ACCESS_TOKEN")
    ) {
      await refreshAccessToken();
      return await fn();
    }
    throw err;
  }
}

// ─── Get available slots ───────────────────────────────────────────────────────

export async function getAvailableSlots({ daysAhead = 14, slotDurationMinutes = 30 } = {}) {
  return callWithTokenRefresh(async () => {
    const now = new Date();
    const end = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const busyData = await gcalFetch("/freeBusy", {
      method: "POST",
      body: JSON.stringify({
        timeMin: now.toISOString(),
        timeMax: end.toISOString(),
        items: [{ id: CALENDAR_ID() }],
      }),
    });

    const busy = busyData.calendars?.[CALENDAR_ID()]?.busy || [];
    const slots = [];
    const workHourStart = 9;
    const workHourEnd = 18;

    const cursor = new Date(now);
    cursor.setMinutes(0, 0, 0);
    cursor.setHours(workHourStart);

    while (cursor < end && slots.length < 30) {
      const slotStart = new Date(cursor);
      const slotEnd = new Date(cursor.getTime() + slotDurationMinutes * 60 * 1000);

      if (slotStart.getHours() >= workHourEnd) {
        cursor.setDate(cursor.getDate() + 1);
        cursor.setHours(workHourStart, 0, 0, 0);
        continue;
      }

      const dayOfWeek = slotStart.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        cursor.setDate(cursor.getDate() + 1);
        cursor.setHours(workHourStart, 0, 0, 0);
        continue;
      }

      const conflict = busy.some(
        (b) => new Date(b.start) < slotEnd && new Date(b.end) > slotStart
      );

      if (!conflict && slotStart > now) {
        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          label: slotStart.toLocaleString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
        });
      }

      cursor.setMinutes(cursor.getMinutes() + slotDurationMinutes);
    }

    return slots;
  });
}

// ─── Create event ──────────────────────────────────────────────────────────────

export async function createAppointment({ summary, description, start, end, attendeeEmail, attendeeName }) {
  return callWithTokenRefresh(async () => {
    const event = await gcalFetch(`/calendars/${encodeURIComponent(CALENDAR_ID())}/events`, {
      method: "POST",
      body: JSON.stringify({
        summary: summary || "Meeting",
        description: description || "",
        start: { dateTime: start, timeZone: "UTC" },
        end: { dateTime: end, timeZone: "UTC" },
        attendees: attendeeEmail ? [{ email: attendeeEmail, displayName: attendeeName || attendeeEmail }] : [],
        reminders: { useDefault: true },
      }),
    });

    const appt = {
      id: event.id,
      googleEventId: event.id,
      summary: event.summary,
      start,
      end,
      attendeeEmail: attendeeEmail || "",
      attendeeName: attendeeName || "",
      status: "booked",
      htmlLink: event.htmlLink,
      createdAt: new Date().toISOString(),
    };

    const { appointments } = await readAppts();
    appointments.unshift(appt);
    await writeAppts({ appointments });

    await notifyOwner("booked", appt);

    return appt;
  });
}

// ─── Reschedule event ──────────────────────────────────────────────────────────

export async function rescheduleAppointment({ appointmentId, newStart, newEnd }) {
  return callWithTokenRefresh(async () => {
    const { appointments } = await readAppts();
    const appt = appointments.find((a) => a.id === appointmentId);
    if (!appt) throw new Error(`Appointment ${appointmentId} not found`);

    const oldStart = appt.start;

    await gcalFetch(`/calendars/${encodeURIComponent(CALENDAR_ID())}/events/${appt.googleEventId}`, {
      method: "PATCH",
      body: JSON.stringify({
        start: { dateTime: newStart, timeZone: "UTC" },
        end: { dateTime: newEnd, timeZone: "UTC" },
      }),
    });

    appt.start = newStart;
    appt.end = newEnd;
    appt.status = "rescheduled";
    appt.previousStart = oldStart;
    appt.rescheduledAt = new Date().toISOString();

    await writeAppts({ appointments });
    await notifyOwner("rescheduled", appt);

    return appt;
  });
}

// ─── Cancel event ──────────────────────────────────────────────────────────────

export async function cancelAppointment({ appointmentId }) {
  return callWithTokenRefresh(async () => {
    const { appointments } = await readAppts();
    const appt = appointments.find((a) => a.id === appointmentId);
    if (!appt) throw new Error(`Appointment ${appointmentId} not found`);

    await gcalFetch(`/calendars/${encodeURIComponent(CALENDAR_ID())}/events/${appt.googleEventId}`, {
      method: "DELETE",
    }).catch(() => {});

    appt.status = "cancelled";
    appt.cancelledAt = new Date().toISOString();
    await writeAppts({ appointments });
    await notifyOwner("cancelled", appt);

    return appt;
  });
}

// ─── Generate booking link ─────────────────────────────────────────────────────

export async function generateBookingLink({ meetingTitle = "Discovery Call", durationMinutes = 30 } = {}) {
  const calendarId = CALENDAR_ID();
  const title = encodeURIComponent(meetingTitle);
  const link = `https://calendar.google.com/calendar/r/eventedit?text=${title}&duration=${durationMinutes}&add=${encodeURIComponent(calendarId)}`;
  return {
    bookingLink: link,
    instruction: "Paste this link in your emails where [BOOKING_LINK] is placed.",
  };
}

// ─── List appointments ─────────────────────────────────────────────────────────

export async function listAppointments({ status } = {}) {
  const { appointments } = await readAppts();
  if (!status) return appointments;
  return appointments.filter((a) => a.status === status);
}

// ─── Owner notification via Nodemailer or log ──────────────────────────────────

async function notifyOwner(event, appt) {
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) return;

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
  const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);

  if (!smtpUser || !smtpPass) return;

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const subjects = {
      booked: `New appointment booked: ${appt.summary}`,
      rescheduled: `Appointment rescheduled: ${appt.summary}`,
      cancelled: `Appointment cancelled: ${appt.summary}`,
    };

    const bodies = {
      booked: `New meeting booked.\n\nTitle: ${appt.summary}\nWith: ${appt.attendeeName || appt.attendeeEmail}\nTime: ${new Date(appt.start).toLocaleString()}\nLink: ${appt.htmlLink || ""}`,
      rescheduled: `Meeting rescheduled.\n\nTitle: ${appt.summary}\nOld time: ${new Date(appt.previousStart).toLocaleString()}\nNew time: ${new Date(appt.start).toLocaleString()}\nWith: ${appt.attendeeName || appt.attendeeEmail}`,
      cancelled: `Meeting cancelled.\n\nTitle: ${appt.summary}\nWith: ${appt.attendeeName || appt.attendeeEmail}\nOriginal time: ${new Date(appt.start).toLocaleString()}`,
    };

    await transporter.sendMail({
      from: smtpUser,
      to: ownerEmail,
      subject: subjects[event] || `Calendar update: ${event}`,
      text: bodies[event] || JSON.stringify(appt),
    });
  } catch {
    // Notification is best-effort; never break the main flow.
  }
}
