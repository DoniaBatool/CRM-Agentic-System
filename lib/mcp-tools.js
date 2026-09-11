/**
 * Pure handler functions for each MCP tool.
 * Extracted from index.js so they can be unit-tested without spinning up McpServer.
 *
 * Each function receives (params, ghlClient) and returns the MCP content response shape.
 */

import axios from "axios";

// ─── list_workflows ────────────────────────────────────────────────────────────

export async function handleListWorkflows({ locationId }, ghlClient, defaultLocationId) {
  const locId = locationId || defaultLocationId;
  try {
    const response = await ghlClient.get(`/workflows/`, { params: { locationId: locId } });
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

// ─── get_workflow ──────────────────────────────────────────────────────────────

export async function handleGetWorkflow({ workflowId, locationId }, ghlClient, defaultLocationId) {
  const locId = locationId || defaultLocationId;
  try {
    const response = await ghlClient.get(`/workflows/${workflowId}`, { params: { locationId: locId } });
    return {
      content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err.response?.data?.message || err.message}` }],
      isError: true,
    };
  }
}

// ─── send_inbound_webhook ──────────────────────────────────────────────────────

export async function handleSendInboundWebhook({ webhookUrl, method, payload, headers }) {
  try {
    const response = await axios({
      method: method || "POST",
      url: webhookUrl,
      headers: { "Content-Type": "application/json", ...(headers || {}) },
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

// ─── find_contact ──────────────────────────────────────────────────────────────

export async function handleFindContact({ email, phone, name, locationId }, ghlClient, defaultLocationId) {
  const locId = locationId || defaultLocationId;

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

// ─── trigger_workflow ──────────────────────────────────────────────────────────

export async function handleTriggerWorkflow({ workflowId, contactId, eventStartTime, locationId }, ghlClient, defaultLocationId) {
  const locId = locationId || defaultLocationId;
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

// ─── remove_contact_from_workflow ──────────────────────────────────────────────

export async function handleRemoveContactFromWorkflow({ workflowId, contactId, locationId }, ghlClient, defaultLocationId) {
  const locId = locationId || defaultLocationId;
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

// ─── test_run_workflow ─────────────────────────────────────────────────────────

export async function handleTestRunWorkflow(
  { workflowId, testContactName, testContactEmail, testContactPhone, cleanupAfterTest, locationId },
  ghlClient,
  defaultLocationId
) {
  const locId = locationId || defaultLocationId;
  const timestamp = Date.now();
  const name = testContactName || "MCP Test User";
  const phone = testContactPhone || "+10000000000";
  const email = testContactEmail || `mcp-test-${timestamp}@test-workflow.com`;
  const logs = [];

  logs.push("📝 Step 1: Test contact bana rahe hain...");
  let contactId;
  try {
    const contactRes = await ghlClient.post(`/contacts/`, {
      locationId: locId,
      firstName: name.split(" ")[0],
      lastName: name.split(" ").slice(1).join(" ") || "TestUser",
      name,
      email,
      phone,
      tags: ["mcp-test", "workflow-test"],
      source: "mcp-workflow-test",
    });
    contactId = contactRes.data?.contact?.id || contactRes.data?.id;
    logs.push(`✅ Test contact bana: ${name} (ID: ${contactId})`);
    logs.push(`   Email: ${email}`);
  } catch (err) {
    logs.push(`❌ Contact banane mein error: ${JSON.stringify(err.response?.data || err.message, null, 2)}`);
    return { content: [{ type: "text", text: logs.join("\n") }], isError: true };
  }

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
    return { content: [{ type: "text", text: logs.join("\n") }], isError: true };
  }

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

  return { content: [{ type: "text", text: logs.join("\n") }] };
}
