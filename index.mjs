import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, ".env") });

const GHL_API_KEY = process.env.GHL_API_KEY;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;
const GHL_BASE_URL = process.env.GHL_BASE_URL || "https://services.leadconnectorhq.com";
const GHL_API_VERSION = process.env.GHL_API_VERSION || "2021-07-28";

const ghlClient = axios.create({
  baseURL: GHL_BASE_URL,
  headers: {
    Authorization: `Bearer ${GHL_API_KEY}`,
    Version: GHL_API_VERSION,
    "Content-Type": "application/json",
  },
});

const server = new McpServer({
  name: "ghl-custom-mcp",
  version: "1.0.0",
});

// ─── TOOL 1: List Workflows ───────────────────────────────────────────────────
server.tool(
  "list_workflows",
  "GHL location ke saare workflows list karo",
  {
    locationId: z.string().optional().describe("Location ID (optional, .env se leta hai agar nahi diya)"),
  },
  async ({ locationId }) => {
    const locId = locationId || GHL_LOCATION_ID;
    try {
      const response = await ghlClient.get(`/workflows/`, {
        params: { locationId: locId },
      });
      const workflows = response.data?.workflows || [];
      const formatted = workflows.map((wf) => ({
        id: wf.id,
        name: wf.name,
        status: wf.status,
        version: wf.version,
        createdAt: wf.createdAt,
        updatedAt: wf.updatedAt,
      }));
      return {
        content: [
          {
            type: "text",
            text: `Total workflows: ${formatted.length}\n\n${JSON.stringify(formatted, null, 2)}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err.response?.data?.message || err.message}` }],
        isError: true,
      };
    }
  }
);

// ─── TOOL 2: Get Workflow by ID ───────────────────────────────────────────────
server.tool(
  "get_workflow",
  "Kisi specific workflow ki detail ID se lo",
  {
    workflowId: z.string().describe("Workflow ka ID"),
    locationId: z.string().optional().describe("Location ID (optional)"),
  },
  async ({ workflowId, locationId }) => {
    const locId = locationId || GHL_LOCATION_ID;
    try {
      const response = await ghlClient.get(`/workflows/${workflowId}`, {
        params: { locationId: locId },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response.data, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err.response?.data?.message || err.message}` }],
        isError: true,
      };
    }
  }
);

// ─── TOOL 3: Send Inbound Webhook ─────────────────────────────────────────────
server.tool(
  "send_inbound_webhook",
  "GHL workflow ka inbound webhook URL pe custom request bhejo (workflow trigger karne ke liye)",
  {
    webhookUrl: z.string().url().describe("GHL inbound webhook ka pura URL"),
    method: z.enum(["POST", "GET", "PUT"]).optional().default("POST").describe("HTTP method (default: POST)"),
    payload: z.record(z.any()).optional().describe("Request body (JSON object) jo webhook pe bhejna hai"),
    headers: z.record(z.string()).optional().describe("Extra headers jo add karne hain"),
  },
  async ({ webhookUrl, method, payload, headers }) => {
    try {
      const response = await axios({
        method: method || "POST",
        url: webhookUrl,
        headers: {
          "Content-Type": "application/json",
          ...(headers || {}),
        },
        data: payload || {},
        timeout: 15000,
      });
      return {
        content: [
          {
            type: "text",
            text: `Webhook successfully bheja gaya!\n\nStatus: ${response.status} ${response.statusText}\n\nResponse:\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (err) {
      const errData = err.response
        ? `Status: ${err.response.status}\nResponse: ${JSON.stringify(err.response.data, null, 2)}`
        : err.message;
      return {
        content: [{ type: "text", text: `Webhook Error:\n${errData}` }],
        isError: true,
      };
    }
  }
);

// ─── TOOL 4: Test Workflow via Webhook (Sample Request) ───────────────────────
server.tool(
  "test_workflow_webhook",
  "Workflow ko test karo — ek sample contact data ke saath inbound webhook trigger karo",
  {
    webhookUrl: z.string().url().describe("Workflow ka inbound webhook URL"),
    contactName: z.string().optional().default("Test Contact").describe("Sample contact ka naam"),
    contactEmail: z.string().optional().default("test@example.com").describe("Sample contact ki email"),
    contactPhone: z.string().optional().default("+1234567890").describe("Sample contact ka phone"),
    extraFields: z.record(z.any()).optional().describe("Extra custom fields jo test data mein add karne hain"),
  },
  async ({ webhookUrl, contactName, contactEmail, contactPhone, extraFields }) => {
    const samplePayload = {
      type: "ContactCreate",
      locationId: GHL_LOCATION_ID,
      contact: {
        id: `test-${Date.now()}`,
        name: contactName,
        email: contactEmail,
        phone: contactPhone,
        firstName: contactName.split(" ")[0],
        lastName: contactName.split(" ").slice(1).join(" ") || "User",
        source: "mcp-test",
        tags: ["mcp-test"],
        ...extraFields,
      },
      timestamp: new Date().toISOString(),
    };

    try {
      const response = await axios.post(webhookUrl, samplePayload, {
        headers: { "Content-Type": "application/json" },
        timeout: 15000,
      });
      return {
        content: [
          {
            type: "text",
            text: `✅ Test webhook bheja gaya!\n\nSample Payload:\n${JSON.stringify(samplePayload, null, 2)}\n\nServer Response:\nStatus: ${response.status}\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (err) {
      const errData = err.response
        ? `Status: ${err.response.status}\nResponse: ${JSON.stringify(err.response.data, null, 2)}`
        : err.message;
      return {
        content: [
          {
            type: "text",
            text: `❌ Test webhook fail hua:\n\nPayload jo bheja:\n${JSON.stringify(samplePayload, null, 2)}\n\nError:\n${errData}`,
          },
        ],
      };
    }
  }
);

// ─── TOOL 5: Update Workflow Status ───────────────────────────────────────────
server.tool(
  "update_workflow_status",
  "Workflow ko publish ya unpublish karo",
  {
    workflowId: z.string().describe("Workflow ID"),
    status: z.enum(["publish", "unpublish"]).describe("publish ya unpublish"),
    locationId: z.string().optional().describe("Location ID (optional)"),
  },
  async ({ workflowId, status, locationId }) => {
    const locId = locationId || GHL_LOCATION_ID;
    try {
      const response = await ghlClient.put(`/workflows/${workflowId}/${status}`, null, {
        params: { locationId: locId },
      });
      return {
        content: [
          {
            type: "text",
            text: `Workflow ${status} ho gaya!\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err.response?.data?.message || err.message}` }],
        isError: true,
      };
    }
  }
);

// ─── TOOL 6: Find Contact by Email / Phone / Name ────────────────────────────
server.tool(
  "find_contact",
  "Contact ko email, phone ya naam se dhundho aur uska GHL Contact ID pao — trigger_workflow ke liye zaruri hai",
  {
    email: z.string().optional().describe("Contact ki email address"),
    phone: z.string().optional().describe("Contact ka phone number"),
    name: z.string().optional().describe("Contact ka naam (partial bhi chal sakta hai)"),
    locationId: z.string().optional().describe("Location ID (optional)"),
  },
  async ({ email, phone, name, locationId }) => {
    const locId = locationId || GHL_LOCATION_ID;

    if (!email && !phone && !name) {
      return {
        content: [{ type: "text", text: "❌ Kam az kam ek field do: email, phone, ya naam" }],
        isError: true,
      };
    }

    try {
      const params = { locationId: locId, limit: 5 };
      if (email) params.email = email;
      if (phone) params.phone = phone;
      if (name) params.query = name;

      const response = await ghlClient.get(`/contacts/search`, { params });
      const contacts = response.data?.contacts || [];

      if (contacts.length === 0) {
        return {
          content: [{ type: "text", text: "⚠️ Koi contact nahi mila. Email/phone/naam check karo." }],
        };
      }

      const formatted = contacts.map((c) => ({
        contactId: c.id,
        name: c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim(),
        email: c.email,
        phone: c.phone,
        tags: c.tags,
      }));

      return {
        content: [
          {
            type: "text",
            text: `✅ ${contacts.length} contact(s) mila:\n\n${JSON.stringify(formatted, null, 2)}\n\n💡 Upar se contactId copy karo aur trigger_workflow mein use karo.`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `❌ Error: ${JSON.stringify(err.response?.data || err.message, null, 2)}` }],
        isError: true,
      };
    }
  }
);

// ─── TOOL 7 (was 6): Trigger Any Workflow ─────────────────────────────────────
server.tool(
  "trigger_workflow",
  "Kisi bhi workflow ko trigger karo — ek existing contact ko workflow mein add karke. Yeh har type ke workflow ke liye kaam karta hai (webhook, contact trigger, form — sab).",
  {
    workflowId: z.string().describe("Workflow ka ID jo trigger karna hai"),
    contactId: z.string().describe("GHL Contact ID jo is workflow mein add karna hai"),
    eventStartTime: z.string().optional().describe("ISO 8601 format mein event start time (optional, e.g. 2026-04-06T10:00:00+05:30)"),
    locationId: z.string().optional().describe("Location ID (optional)"),
  },
  async ({ workflowId, contactId, eventStartTime, locationId }) => {
    const locId = locationId || GHL_LOCATION_ID;
    try {
      const body = {};
      if (eventStartTime) body.eventStartTime = eventStartTime;

      const response = await ghlClient.post(
        `/contacts/${contactId}/workflow/${workflowId}`,
        body,
        { params: { locationId: locId } }
      );

      return {
        content: [
          {
            type: "text",
            text: `✅ Workflow trigger ho gaya!\n\nWorkflow ID: ${workflowId}\nContact ID: ${contactId}\n\nResponse:\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Workflow trigger fail hua:\nStatus: ${err.response?.status}\nError: ${JSON.stringify(err.response?.data || err.message, null, 2)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ─── TOOL 7: Remove Contact from Workflow ─────────────────────────────────────
server.tool(
  "remove_contact_from_workflow",
  "Contact ko workflow se remove karo (test ke baad cleanup ke liye)",
  {
    workflowId: z.string().describe("Workflow ID"),
    contactId: z.string().describe("Contact ID jo workflow se remove karna hai"),
    locationId: z.string().optional().describe("Location ID (optional)"),
  },
  async ({ workflowId, contactId, locationId }) => {
    const locId = locationId || GHL_LOCATION_ID;
    try {
      const response = await ghlClient.delete(
        `/contacts/${contactId}/workflow/${workflowId}`,
        { params: { locationId: locId } }
      );
      return {
        content: [
          {
            type: "text",
            text: `✅ Contact workflow se remove ho gaya!\n\nWorkflow ID: ${workflowId}\nContact ID: ${contactId}\n\nResponse:\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Remove fail hua:\nStatus: ${err.response?.status}\nError: ${JSON.stringify(err.response?.data || err.message, null, 2)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ─── TOOL 8: Create Test Contact + Trigger Workflow (one-shot test) ───────────
server.tool(
  "test_run_workflow",
  "Kisi bhi workflow ka complete test run karo — ek temporary test contact banao, workflow trigger karo, aur result dikhao. Yeh sabse aasaan testing tool hai.",
  {
    workflowId: z.string().describe("Workflow ID jo test karni hai"),
    testContactName: z.string().optional().default("MCP Test User").describe("Test contact ka naam"),
    testContactEmail: z.string().optional().describe("Test contact ki email (agar nahi di toh auto-generate hogi)"),
    testContactPhone: z.string().optional().default("+10000000000").describe("Test contact ka phone"),
    cleanupAfterTest: z.boolean().optional().default(false).describe("Test ke baad contact ko workflow se remove karein? (default: false)"),
    locationId: z.string().optional().describe("Location ID (optional)"),
  },
  async ({ workflowId, testContactName, testContactEmail, testContactPhone, cleanupAfterTest, locationId }) => {
    const locId = locationId || GHL_LOCATION_ID;
    const timestamp = Date.now();
    const email = testContactEmail || `mcp-test-${timestamp}@test-workflow.com`;
    const logs = [];

    // Step 1: Test contact banao
    logs.push("📝 Step 1: Test contact bana rahe hain...");
    let contactId;
    try {
      const contactRes = await ghlClient.post(`/contacts/`, {
        locationId: locId,
        firstName: testContactName.split(" ")[0],
        lastName: testContactName.split(" ").slice(1).join(" ") || "TestUser",
        name: testContactName,
        email,
        phone: testContactPhone,
        tags: ["mcp-test", "workflow-test"],
        source: "mcp-workflow-test",
      });
      contactId = contactRes.data?.contact?.id || contactRes.data?.id;
      logs.push(`✅ Test contact bana: ${testContactName} (ID: ${contactId})`);
      logs.push(`   Email: ${email}`);
    } catch (err) {
      const errMsg = `❌ Contact banane mein error: ${JSON.stringify(err.response?.data || err.message, null, 2)}`;
      logs.push(errMsg);
      return {
        content: [{ type: "text", text: logs.join("\n") }],
        isError: true,
      };
    }

    // Step 2: Workflow trigger karo
    logs.push(`\n🚀 Step 2: Workflow trigger kar rahe hain (ID: ${workflowId})...`);
    try {
      const triggerRes = await ghlClient.post(
        `/contacts/${contactId}/workflow/${workflowId}`,
        {},
        { params: { locationId: locId } }
      );
      logs.push(`✅ Workflow successfully trigger hua!`);
      logs.push(`   Response: ${JSON.stringify(triggerRes.data, null, 2)}`);
    } catch (err) {
      logs.push(`❌ Workflow trigger fail: ${JSON.stringify(err.response?.data || err.message, null, 2)}`);
      logs.push(`\n💡 Tip: Workflow published hai? Unpublished workflows trigger nahi hoti.`);
      logs.push(`   Contact ID jo bana: ${contactId} — manually check kar sako GHL mein.`);
      return {
        content: [{ type: "text", text: logs.join("\n") }],
        isError: true,
      };
    }

    // Step 3: Cleanup (optional)
    if (cleanupAfterTest && contactId) {
      logs.push(`\n🧹 Step 3: Cleanup — contact ko workflow se remove kar rahe hain...`);
      try {
        await ghlClient.delete(`/contacts/${contactId}/workflow/${workflowId}`, {
          params: { locationId: locId },
        });
        logs.push(`✅ Contact workflow se remove ho gaya.`);
      } catch (err) {
        logs.push(`⚠️ Cleanup fail (ignore kar sakte ho): ${err.response?.data?.message || err.message}`);
      }
    }

    logs.push(`\n📋 Test Summary:`);
    logs.push(`   Workflow ID: ${workflowId}`);
    logs.push(`   Test Contact ID: ${contactId}`);
    logs.push(`   Test Contact Email: ${email}`);
    logs.push(`   GHL mein jaake workflow history check karo is contact ke liye.`);

    return {
      content: [{ type: "text", text: logs.join("\n") }],
    };
  }
);

// ─── Start Server ─────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GHL Custom MCP Server chal raha hai...");
}

main().catch((err) => {
  console.error("Server error:", err);
  process.exit(1);
});
