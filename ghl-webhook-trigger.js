import readline from "readline";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import axios from "axios";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, ".env") });

// ── Config ─────────────────────────────────────────────────────
const GHL_API_KEY = process.env.GHL_API_KEY;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;
const GHL_BASE_URL = process.env.GHL_BASE_URL || "https://services.leadconnectorhq.com";
const GHL_API_VERSION = process.env.GHL_API_VERSION || "2021-07-28";

const WEBHOOK_MAP = {
  treatment: {
    booked: process.env.GHL_WEBHOOK_TREATMENT_BOOKED,
    rescheduled: process.env.GHL_WEBHOOK_TREATMENT_RESCHEDULED,
  },
  personal_consultation: {
    booked: process.env.GHL_WEBHOOK_PC_BOOKED,
    rescheduled: process.env.GHL_WEBHOOK_PC_RESCHEDULED,
  },
};

const ghlClient = axios.create({
  baseURL: GHL_BASE_URL,
  headers: {
    Authorization: `Bearer ${GHL_API_KEY}`,
    Version: GHL_API_VERSION,
    "Content-Type": "application/json",
  },
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

// ── GHL Tools ──────────────────────────────────────────────────
async function findContact(name) {
  const response = await ghlClient.get("/contacts/search", {
    params: { locationId: GHL_LOCATION_ID, query: name, limit: 5 },
  });
  return response.data?.contacts || [];
}

async function sendWebhook(webhookUrl, payload) {
  const response = await axios.post(webhookUrl, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: 15000,
  });
  return response;
}

// ── Date/Time Helper ───────────────────────────────────────────
function getDefaultDateTime() {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  now.setHours(10, 0, 0, 0);
  return now.toISOString().slice(0, 19);
}

export async function searchContacts(query) {
  const name = (query || "").trim();
  if (!name) {
    throw new Error("Contact query is required.");
  }
  return findContact(name);
}

export async function triggerWorkflowWebhook({ webhookUrl, payload }) {
  if (!webhookUrl) {
    throw new Error("webhookUrl is required.");
  }
  if (!payload || typeof payload !== "object") {
    throw new Error("payload object is required.");
  }

  const res = await sendWebhook(webhookUrl, payload);
  return {
    status: res.status,
    statusText: res.statusText,
    data: res.data,
  };
}

export function getWebhookMap() {
  return WEBHOOK_MAP;
}

export function getSuggestedDateTime() {
  return getDefaultDateTime();
}

// ── Main Agent ─────────────────────────────────────────────────
async function main() {
  console.log("\n🤖 GHL Workflow Tester Agent");
  console.log("==============================\n");

  while (true) {
    const input = await ask("💬 Command (ya 'exit'): ");

    if (input.toLowerCase() === "exit") {
      console.log("\n👋 Bye!");
      rl.close();
      break;
    }

    // ── Contact search trigger ──
    const contactMatch = input.match(/contact[:\s]+(.+)/i);
    if (!contactMatch) {
      console.log("\n💡 Likho: contact: <naam>\n");
      continue;
    }

    const contactName = contactMatch[1].trim();
    console.log(`\n🔍 "${contactName}" ko dhundh raha hun...`);

    // Step 1: Find contact
    let contacts;
    try {
      contacts = await findContact(contactName);
    } catch (e) {
      console.log(`❌ Contact search error: ${e.message}\n`);
      continue;
    }

    if (contacts.length === 0) {
      console.log(`⚠️ Koi contact nahi mila "${contactName}" naam se.\n`);
      continue;
    }

    // Step 2: Show contacts & confirm
    console.log(`\n📋 ${contacts.length} contact(s) mila:\n`);
    contacts.forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.name || `${c.firstName} ${c.lastName}`}`);
      console.log(`     Email: ${c.email || "N/A"}`);
      console.log(`     Phone: ${c.phone || "N/A"}`);
      console.log(`     ID: ${c.id}\n`);
    });

    let selectedContact;
    if (contacts.length === 1) {
      const confirm = await ask("✅ Kya yahi contact hai? (y/n): ");
      if (confirm.toLowerCase() !== "y") {
        console.log("❌ Cancel.\n");
        continue;
      }
      selectedContact = contacts[0];
    } else {
      const num = await ask("Konsa contact? (number batao): ");
      const idx = parseInt(num.trim()) - 1;
      if (idx < 0 || idx >= contacts.length) {
        console.log("❌ Invalid choice.\n");
        continue;
      }
      selectedContact = contacts[idx];
    }

    const firstName = selectedContact.firstName || selectedContact.name?.split(" ")[0] || "";
    const lastName = selectedContact.lastName || selectedContact.name?.split(" ").slice(1).join(" ") || "";

    console.log(`\n✅ Contact confirmed: ${selectedContact.name || firstName + " " + lastName}\n`);

    // Step 3: Event type
    console.log("📌 Event type:");
    console.log("  1. Treatment Booked");
    console.log("  2. Treatment Rescheduled");
    console.log("  3. Personal Consultation Booked");
    console.log("  4. Personal Consultation Rescheduled\n");

    const eventChoice = await ask("Choice (1/2/3/4): ");

    let eventType, action, webhookUrl, eventLabel;

    switch (eventChoice.trim()) {
      case "1":
        eventType = "treatment"; action = "booked";
        webhookUrl = WEBHOOK_MAP.treatment.booked;
        eventLabel = "Treatment Booked";
        break;
      case "2":
        eventType = "treatment"; action = "rescheduled";
        webhookUrl = WEBHOOK_MAP.treatment.rescheduled;
        eventLabel = "Treatment Rescheduled";
        break;
      case "3":
        eventType = "Personal Consultation"; action = "booked";
        webhookUrl = WEBHOOK_MAP.personal_consultation.booked;
        eventLabel = "Personal Consultation Booked";
        break;
      case "4":
        eventType = "Personal Consultation"; action = "rescheduled";
        webhookUrl = WEBHOOK_MAP.personal_consultation.rescheduled;
        eventLabel = "Personal Consultation Rescheduled";
        break;
      default:
        console.log("❌ Invalid choice.\n");
        continue;
    }

    // Check webhook URL
    if (!webhookUrl || webhookUrl === "PENDING") {
      console.log(`⚠️ "${eventLabel}" ka webhook URL abhi PENDING hai .env mein.\n`);
      continue;
    }

    // Step 4: Date & Time
    const defaultDT = getDefaultDateTime();
    const dtInput = await ask(`📅 Appointment date/time? (Enter dabao default k liyae: ${defaultDT}): `);
    const appointmentDatetime = dtInput.trim() || defaultDT;

    // Step 5: Build payload
    const payload = {
      event: eventType,
      action: action,
      email: selectedContact.email || "",
      contact_number: selectedContact.phone || "",
      first_name: firstName,
      last_name: lastName,
      appointment_datetime: appointmentDatetime,
      secret: "abc123",
    };

    // Step 6: Preview & confirm
    console.log("\n📦 Payload jo bheja jayega:");
    console.log("─────────────────────────────");
    console.log(JSON.stringify(payload, null, 2));
    console.log(`\n🔗 Webhook: ${webhookUrl}`);
    console.log("─────────────────────────────");

    const sendConfirm = await ask("\n🚀 Bhejun? (y/n): ");
    if (sendConfirm.toLowerCase() !== "y") {
      console.log("❌ Cancel.\n");
      continue;
    }

    // Step 7: Send webhook
    try {
      const res = await sendWebhook(webhookUrl, payload);
      console.log(`\n✅ Webhook bhej diya!`);
      console.log(`   Status: ${res.status} ${res.statusText}`);
      console.log(`   Response: ${JSON.stringify(res.data, null, 2)}\n`);
    } catch (e) {
      console.log(`\n❌ Webhook error: ${e.message}\n`);
    }
  }
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}