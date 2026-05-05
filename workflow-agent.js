import OpenAI from "openai";
import { chromium } from "playwright";
import fs from "fs";
import readline from "readline";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
dotenv.config();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const AUTH_FILE = "auth.json";
const OUTPUT_DIR = "workflows";

function sanitizeSubAccountName(subAccountName = "") {
  return subAccountName.replace(/[<>:"/\\|?*]+/g, "_").trim() || "unknown-sub-account";
}

// ── GHL API: workflow list ──────────────────────────────────────
async function fetchWorkflows(locationId, token) {
  const res = await fetch(
    `https://services.leadconnectorhq.com/workflows/?locationId=${locationId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "2021-07-28",
        Accept: "application/json",
      },
    }
  );
  const data = await res.json();
  return data.workflows || [];
}

export async function listWorkflows({ locationId, token }) {
  if (!locationId || !token) {
    throw new Error("locationId and token are required.");
  }
  return fetchWorkflows(locationId, token);
}

export async function exportSelectedWorkflows({
  subAccountName,
  locationId,
  token,
  workflowIds = [],
}) {
  if (!subAccountName || !locationId || !token) {
    throw new Error("subAccountName, locationId, and token are required.");
  }
  if (!Array.isArray(workflowIds) || workflowIds.length === 0) {
    throw new Error("workflowIds must be a non-empty array.");
  }

  const workflows = await fetchWorkflows(locationId, token);
  const selected = workflows.filter((wf) => workflowIds.includes(wf.id));
  const safeSubAccountName = sanitizeSubAccountName(subAccountName);
  const subAccountOutputDir = `${OUTPUT_DIR}/${safeSubAccountName}`;

  if (!selected.length) {
    return {
      exportedCount: 0,
      outputDir: subAccountOutputDir,
      exportedWorkflows: [],
      missingWorkflowIds: workflowIds,
    };
  }

  const exported = [];
  for (const wf of selected) {
    await exportWorkflow(wf, locationId, subAccountOutputDir);
    exported.push({ id: wf.id, name: wf.name });
  }

  const missingWorkflowIds = workflowIds.filter(
    (id) => !selected.some((wf) => wf.id === id)
  );

  return {
    exportedCount: exported.length,
    outputDir: subAccountOutputDir,
    exportedWorkflows: exported,
    missingWorkflowIds,
  };
}

export function listExportedWorkflowFiles({ subAccountName }) {
  if (!subAccountName) {
    throw new Error("subAccountName is required.");
  }

  const safeSubAccountName = sanitizeSubAccountName(subAccountName);
  const subAccountOutputDir = `${OUTPUT_DIR}/${safeSubAccountName}`;
  if (!fs.existsSync(subAccountOutputDir)) {
    return {
      outputDir: subAccountOutputDir,
      files: [],
    };
  }

  const files = fs
    .readdirSync(subAccountOutputDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({
      id: name,
      fileName: name,
      filePath: `${subAccountOutputDir}/${name}`,
    }));

  return {
    outputDir: subAccountOutputDir,
    files,
  };
}

export function deleteExportedWorkflowFiles({ subAccountName, fileNames = [] }) {
  if (!subAccountName) {
    throw new Error("subAccountName is required.");
  }
  if (!Array.isArray(fileNames) || fileNames.length === 0) {
    throw new Error("fileNames must be a non-empty array.");
  }

  const safeSubAccountName = sanitizeSubAccountName(subAccountName);
  const subAccountOutputDir = `${OUTPUT_DIR}/${safeSubAccountName}`;
  const deletedFiles = [];
  const missingFiles = [];

  for (const name of fileNames) {
    const fullPath = `${subAccountOutputDir}/${name}`;
    if (!fs.existsSync(fullPath)) {
      missingFiles.push(name);
      continue;
    }
    fs.unlinkSync(fullPath);
    deletedFiles.push(name);
  }

  return {
    outputDir: subAccountOutputDir,
    deletedCount: deletedFiles.length,
    deletedFiles,
    missingFiles,
  };
}

// ── Playwright: capture workflow JSON ──────────────────────────
async function exportWorkflow(wf, locationId, targetDir) {
  const browser = await chromium.launch({ headless: false });

  const context = fs.existsSync(AUTH_FILE)
    ? await browser.newContext({ storageState: AUTH_FILE })
    : await browser.newContext();

  const page = await context.newPage();

  if (!fs.existsSync(AUTH_FILE)) {
    await page.goto("https://login.bucktoothmarketing.com");
    console.log("\n👉 Browser mein login karo, phir terminal mein ENTER dabao...");
    await new Promise(resolve => process.stdin.once("data", resolve));
    await context.storageState({ path: AUTH_FILE });
    console.log("✅ Session saved!");
  }

  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const captured = { workflow: null, trigger: null };

  const responseHandler = async (response) => {
    const url = response.url();
    try {
      if (url.includes(wf.id) && !url.includes("trigger") && captured.workflow === null) {
        captured.workflow = await response.json();
        console.log(`  ✅ Workflow JSON captured`);
      }
      if (url.includes("trigger") && url.includes(wf.id) && captured.trigger === null) {
        captured.trigger = await response.json();
        console.log(`  ✅ Trigger JSON captured`);
      }
    } catch (e) {}
  };

  page.on("response", responseHandler);

  try {
    await page.goto(
      `https://login.bucktoothmarketing.com/location/${locationId}/workflow/${wf.id}`,
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );
  } catch (e) {
    console.log(`  ⚠️ Navigation: ${e.message}`);
  }

  let waited = 0;
  while ((captured.workflow === null || captured.trigger === null) && waited < 15000) {
    await page.waitForTimeout(500);
    waited += 500;
  }

  page.off("response", responseHandler);

  const safeName = wf.name.replace(/[<>:"/\\|?*]+/g, "_");
  const output = {
    workflow_id: wf.id,
    workflow_name: wf.name,
    location_id: locationId,
    exported_at: new Date().toISOString(),
    workflow_json: captured.workflow,
    trigger_json: captured.trigger,
  };

  fs.writeFileSync(
    `${targetDir}/${safeName}.json`,
    JSON.stringify(output, null, 2)
  );
  console.log(`  💾 Saved: ${safeName}.json`);

  await browser.close();
}

// ── Main Agent ─────────────────────────────────────────────────
async function main() {
  console.log("\n🤖 GHL Workflow Export Agent");
  console.log("================================\n");

  // Sub-account name
  const subAccountName = await ask("📋 Kis sub-account ke workflows chahiye? (naam batao): ");
  const safeSubAccountName = sanitizeSubAccountName(subAccountName);
  const subAccountOutputDir = `${OUTPUT_DIR}/${safeSubAccountName}`;

  // Location ID
  const locationId = await ask(`📍 ${subAccountName} ka Location ID: `);

  // Token
  const token = await ask(`🔑 ${subAccountName} ka Personal Integration Token: `);

  // Save to .env
  const envContent = `LOCATION_ID=${locationId}\nGHL_TOKEN=${token}\nOPENAI_API_KEY=${process.env.OPENAI_API_KEY || ""}\n`;
  fs.writeFileSync(".env", envContent);
  console.log("✅ Credentials .env mein save ho gaye!\n");

  // Fetch workflows
  console.log("⏳ Workflows ki list fetch ho rahi hai...");
  let workflows;
  try {
    workflows = await fetchWorkflows(locationId, token);
  } catch (e) {
    console.log("❌ Workflows fetch nahi hue:", e.message);
    rl.close();
    return;
  }

  if (workflows.length === 0) {
    console.log("❌ Koi workflow nahi mila!");
    rl.close();
    return;
  }

  // Show list
  console.log(`\n📊 Total workflows: ${workflows.length}`);
  console.log("─────────────────────────────────────────");
  workflows.forEach((wf, i) => {
    console.log(`${i + 1}. ${wf.name}`);
    console.log(`   ID: ${wf.id}`);
    console.log(`   Status: ${wf.status || "N/A"}`);
    console.log("");
  });
  console.log("─────────────────────────────────────────");

  // Filter option
  const filterChoice = await ask(
    "\n🔍 Kya filter/sort karna hai?\n" +
    "  1. Saare workflows export karo\n" +
    "  2. Specific workflows choose karo\n" +
    "  3. Sirf active workflows\n" +
    "Choice (1/2/3): "
  );

  let selectedWorkflows = workflows;

  if (filterChoice === "2") {
    const nums = await ask("Numbers batao (comma separated, e.g. 1,3,5): ");
    const indices = nums.split(",").map(n => parseInt(n.trim()) - 1);
    selectedWorkflows = indices
      .filter(i => i >= 0 && i < workflows.length)
      .map(i => workflows[i]);
    console.log(`\n✅ ${selectedWorkflows.length} workflows selected`);
  } else if (filterChoice === "3") {
    selectedWorkflows = workflows.filter(wf => wf.status === "published");
    console.log(`\n✅ ${selectedWorkflows.length} active workflows`);
  }

  // Confirm
  console.log("\n📋 Yeh workflows export hongi:");
  selectedWorkflows.forEach((wf, i) => console.log(`  ${i + 1}. ${wf.name}`));

  const confirm = await ask("\n✅ Confirm? (y/n): ");
  if (confirm.toLowerCase() !== "y") {
    console.log("❌ Export cancel!");
    rl.close();
    return;
  }

  // Export each workflow
  console.log("\n🚀 Export shuru...\n");

  for (let i = 0; i < selectedWorkflows.length; i++) {
    const wf = selectedWorkflows[i];
    console.log(`\n[${i + 1}/${selectedWorkflows.length}] ${wf.name}`);
    try {
      await exportWorkflow(wf, locationId, subAccountOutputDir);
      if (i < selectedWorkflows.length - 1) {
        console.log("  ⏱️ 2 second wait...");
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
    }
  }

  console.log("\n🎉 Export complete!");
  console.log(`📁 Files saved in: ./${subAccountOutputDir}/`);
  rl.close();
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}