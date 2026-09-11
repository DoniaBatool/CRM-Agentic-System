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

// Per-location auth file — different GHL accounts get separate sessions.
// auth-{locationId}.json so switching accounts never cross-contaminates.
const authFile = (locationId) => `auth-${locationId}.json`;
const OUTPUT_DIR = "workflows";

function sanitizeSubAccountName(subAccountName = "") {
  // Lowercase + sanitize so "Bucktooth Marketing" and "bucktooth marketing"
  // always map to the same folder — prevents duplicate folders on case variation.
  return subAccountName.toLowerCase().replace(/[<>:"/\\|?*]+/g, "_").trim() || "unknown-sub-account";
}

// GHL uses login.bucktoothmarketing.com as the domain for ALL pages.
// Login page = root "/" (with optional ?logout). Dashboard/workflow = has a real path.
function isLoginPage(url) {
  try {
    const p = new URL(url);
    return p.pathname === "/" || p.pathname === "" || p.search.includes("logout");
  } catch { return true; }
}

// ── GHL API: workflow list ──────────────────────────────────────
async function fetchWorkflows(locationId, token) {
  const cleanLocationId = (locationId || "").trim();
  const cleanToken = (token || "").trim();
  const res = await fetch(
    `https://services.leadconnectorhq.com/workflows/?locationId=${cleanLocationId}`,
    {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        Version: "2021-07-28",
        Accept: "application/json",
      },
    }
  );
  let data;
  try {
    data = await res.json();
  } catch (_) {
    throw new Error(
      `GHL API non-JSON response (HTTP ${res.status} ${res.statusText}). Token/locationId check karo.`
    );
  }
  if (!res.ok) {
    const apiMsg =
      data?.message ||
      data?.error ||
      (Array.isArray(data?.errors) ? data.errors.join(", ") : null) ||
      JSON.stringify(data);
    throw new Error(`GHL API error (HTTP ${res.status}): ${apiMsg}`);
  }
  return data.workflows || [];
}

export async function listWorkflows({ locationId, token }) {
  if (!locationId || !token) {
    throw new Error("locationId and token are required.");
  }
  return fetchWorkflows(locationId, token);
}

// ── API-first: fetch one workflow's JSON + trigger via PIT token ─
// No browser / login needed. Returns { workflowJson, triggerJson }.
// Throws if API returns non-OK.
async function fetchWorkflowViaApi(wf, locationId, token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Version: "2021-07-28",
    Accept: "application/json",
  };

  // Step 1: workflow detail from GHL REST API
  const wfRes = await fetch(
    `https://services.leadconnectorhq.com/workflows/${wf.id}?locationId=${locationId}`,
    { headers }
  );
  if (!wfRes.ok) {
    const body = await wfRes.text().catch(() => "");
    throw new Error(`Workflow API ${wfRes.status}: ${body.slice(0, 120)}`);
  }
  const workflowJson = await wfRes.json();
  // Must have workflowData AND the _id must match the requested workflow.
  // GHL API may return unrelated JSON (e.g. account/company data) that has an _id
  // but is completely wrong. Validate both fields to avoid saving garbage.
  if (!workflowJson || !workflowJson.workflowData) {
    throw new Error("API response missing workflowData — endpoint does not support single-workflow detail fetch");
  }
  if (workflowJson._id && workflowJson._id !== wf.id) {
    throw new Error(`API returned wrong workflow (_id=${workflowJson._id}, expected ${wf.id}) — falling back to Playwright`);
  }

  // Step 2: trigger JSON via Firebase Storage (URL + token embedded in workflowJson.fileUrl)
  let triggerJson = null;
  if (workflowJson.triggersFilePath && workflowJson.fileUrl) {
    try {
      const fileUrl = workflowJson.fileUrl;
      const baseMatch = fileUrl.match(/^(https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/)/);
      const tokenMatch = fileUrl.match(/[?&]token=([^&]+)/);
      if (baseMatch && tokenMatch) {
        const triggerUrl =
          `${baseMatch[1]}${encodeURIComponent(workflowJson.triggersFilePath)}` +
          `?alt=media&token=${tokenMatch[1]}`;
        const tRes = await fetch(triggerUrl);
        if (tRes.ok) triggerJson = await tRes.json();
      }
    } catch (_) {}
  }

  return { workflowJson, triggerJson };
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

  if (!fs.existsSync(subAccountOutputDir)) {
    fs.mkdirSync(subAccountOutputDir, { recursive: true });
  }

  const exported = [];
  const needsPlaywright = []; // workflows where API failed

  // ── PHASE 1: API-first export (no browser, no login needed) ────
  // Uses the same PIT token as listWorkflows. If GHL API supports detail
  // fetch, this is instant and completely reliable. Falls back to Playwright
  // only for workflows where the API returns 401/404/missing data.
  console.log(`\n🔑 Phase 1: API export (no browser)...`);
  for (let i = 0; i < selected.length; i++) {
    const wf = selected[i];
    console.log(`\n[${i + 1}/${selected.length}] ${wf.name}`);
    try {
      const { workflowJson, triggerJson } = await fetchWorkflowViaApi(wf, locationId, token);
      const safeName = wf.name.replace(/[<>:"/\\|?*]+/g, "_");
      fs.writeFileSync(
        `${subAccountOutputDir}/${safeName}.json`,
        JSON.stringify({
          workflow_id: wf.id,
          workflow_name: wf.name,
          location_id: locationId,
          exported_at: new Date().toISOString(),
          workflow_json: workflowJson,
          trigger_json: triggerJson,
        }, null, 2)
      );
      console.log(`  ✅ API export OK — trigger: ${triggerJson ? "yes" : "no"}`);
      console.log(`  💾 Saved: ${safeName}.json`);
      exported.push({ id: wf.id, name: wf.name });
    } catch (e) {
      console.log(`  ⚠️ API failed (${e.message.slice(0, 80)}) → Playwright fallback`);
      needsPlaywright.push(wf);
    }
  }

  // All done via API — no browser needed
  if (needsPlaywright.length === 0) {
    const missingWorkflowIds = workflowIds.filter((id) => !selected.some((wf) => wf.id === id));
    return { exportedCount: exported.length, outputDir: subAccountOutputDir, exportedWorkflows: exported, missingWorkflowIds };
  }

  // ── PHASE 2: Playwright fallback for workflows where API failed ─
  // Login is per-locationId (auth-{locationId}.json). Same location = login once.
  // Different location = separate session file = separate one-time login.
  const AUTH = authFile(locationId);
  console.log(`\n🌐 Phase 2: Playwright fallback (${needsPlaywright.length} workflow(s))...`);

  const browser = await chromium.launch({ headless: false });
  const context = fs.existsSync(AUTH)
    ? await browser.newContext({ storageState: AUTH })
    : await browser.newContext();
  const page = await context.newPage();

  // Patch window.fetch before GHL scripts load — intercepts ALL JSON API calls
  await page.addInitScript(() => {
    window.__ghl_captures = { workflow: null, trigger: null };
    if (!window.__ghl_fetch_patched) {
      window.__ghl_fetch_patched = true;
      const _orig = window.fetch;
      window.fetch = async function (...args) {
        const res = await _orig.apply(this, args);
        try {
          const url = typeof args[0] === "string" ? args[0] : (args[0]?.url ?? "");
          res.clone().json().then((json) => {
            if (!json) return;
            const urlLower = url.toLowerCase();
            if (!window.__ghl_captures.workflow && !urlLower.includes("trigger")) {
              // Must have workflowData to avoid capturing unrelated GHL responses that
              // happen to contain _id (e.g. account/company onboarding data).
              if (json.workflowData || json.templateData || json.templates) {
                window.__ghl_captures.workflow = json;
              }
            }
            if (!window.__ghl_captures.trigger && urlLower.includes("trigger")) {
              window.__ghl_captures.trigger = json;
            }
          }).catch(() => {});
        } catch (e) {}
        return res;
      };
    }
  });

  // ── Login once for this locationId (if no saved session) ───────
  const hadAuthFile = fs.existsSync(AUTH);
  let needsLogin = !hadAuthFile;

  if (!needsLogin) {
    // Try saved session — navigate to a dashboard URL
    await page.goto(
      `https://login.bucktoothmarketing.com/location/${locationId}/workflow/${needsPlaywright[0].id}`,
      { waitUntil: "domcontentloaded", timeout: 30000 }
    ).catch(() => {});

    // If GHL rejected the saved session and sent us back to login,
    // clear stale cookies + delete the bad auth file so login is clean
    if (isLoginPage(page.url())) {
      console.log("  ⚠️ Saved session expired — clearing stale auth and logging in fresh.");
      await context.clearCookies();
      await context.clearPermissions();
      try { fs.unlinkSync(AUTH); } catch (_) {}
      needsLogin = true;
    }
  }

  if (needsLogin) {
    await page.goto("https://login.bucktoothmarketing.com", { waitUntil: "domcontentloaded", timeout: 30000 });
  }

  const currentUrl = page.url();
  if (isLoginPage(currentUrl) || needsLogin) {
    console.log("\n👉 Browser mein login karo (email + password + OTP sab).");
    console.log("   ✋  OTP ke baad GHL 'ai-employee-promo' page pe redirect karega — tabhi browser aage badhega.");
    try {
      // Only resolve when GHL's post-login landing page appears.
      // /ai-employee-promo = GHL's confirmed post-login redirect.
      // /location/ = directly in a sub-account (also fully authenticated).
      // /agency = agency dashboard.
      // ALL other paths (/, /two-factor, /email-otp, /verify-email, etc.) are blocked.
      await page.waitForURL(
        (url) => {
          const p = url.pathname;
          return (
            p === "/ai-employee-promo" ||
            p.startsWith("/location/") ||
            p.startsWith("/agency")
          );
        },
        { timeout: 300000 } // 5 minutes
      );
    } catch {
      console.log("  ⚠️ Login timeout (5 min). Browser band ho raha hai.");
      await browser.close();
      const missingWorkflowIds = workflowIds.filter((id) => !selected.some((wf) => wf.id === id));
      return { exportedCount: exported.length, outputDir: subAccountOutputDir, exportedWorkflows: exported, missingWorkflowIds, error: "Login timeout" };
    }
    await context.storageState({ path: AUTH });
    console.log(`✅ Session saved → ${AUTH} (agle baar is account ke liye login nahi chahiye)`);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  }

  // ── Export each workflow via Playwright ────────────────────────
  for (let i = 0; i < needsPlaywright.length; i++) {
    const wf = needsPlaywright[i];
    console.log(`\n[PW ${i + 1}/${needsPlaywright.length}] ${wf.name} (${wf.id})`);
    try {
      await exportWorkflowWithPage(wf, locationId, subAccountOutputDir, page);
      exported.push({ id: wf.id, name: wf.name });
    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
    }
  }

  await browser.close();

  const missingWorkflowIds = workflowIds.filter((id) => !selected.some((wf) => wf.id === id));
  return { exportedCount: exported.length, outputDir: subAccountOutputDir, exportedWorkflows: exported, missingWorkflowIds };
}

/** Returns all sub-account folder names that exist inside workflows/ */
export function listAvailableSubAccounts() {
  if (!fs.existsSync(OUTPUT_DIR)) return { subAccounts: [] };
  const entries = fs.readdirSync(OUTPUT_DIR, { withFileTypes: true });
  const subAccounts = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name);
  return { subAccounts };
}

export function listExportedWorkflowFiles({ subAccountName }) {
  if (!subAccountName) {
    throw new Error("subAccountName is required.");
  }

  const safeSubAccountName = sanitizeSubAccountName(subAccountName);
  let subAccountOutputDir = `${OUTPUT_DIR}/${safeSubAccountName}`;

  // If exact sanitized folder doesn't exist, fuzzy-match against available folders
  if (!fs.existsSync(subAccountOutputDir)) {
    const { subAccounts } = listAvailableSubAccounts();
    // Find closest folder — normalize both sides and compare
    const normalize = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
    const inputNorm = normalize(subAccountName);
    const match = subAccounts.find((folder) => normalize(folder) === inputNorm)
      || subAccounts.find((folder) => normalize(folder).includes(inputNorm) || inputNorm.includes(normalize(folder)));
    if (match) {
      subAccountOutputDir = `${OUTPUT_DIR}/${match}`;
    } else {
      return { outputDir: subAccountOutputDir, files: [], availableSubAccounts: subAccounts };
    }
  }

  const files = fs
    .readdirSync(subAccountOutputDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({
      id: name,
      fileName: name,
      filePath: `${subAccountOutputDir}/${name}`,
    }));

  const { subAccounts } = listAvailableSubAccounts();
  return { outputDir: subAccountOutputDir, files, availableSubAccounts: subAccounts };
}

export function loadExportedWorkflowContent({ subAccountName, fileName }) {
  if (!subAccountName || !fileName) {
    throw new Error("subAccountName and fileName are required.");
  }
  const safeSubAccountName = sanitizeSubAccountName(subAccountName);
  const filePath = `${OUTPUT_DIR}/${safeSubAccountName}/${fileName}`;
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${fileName}`);
  }
  const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return { fileName, content };
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

// ── Playwright: capture one workflow using a shared page ───────
async function exportWorkflowWithPage(wf, locationId, targetDir, page) {
  const captured = { workflow: null, trigger: null };

  // Approach 1: CDP-level response interception via page.on("response").
  // Covers Firebase Storage, GHL REST API, and any HTTP endpoint.
  // No URL domain filter — check body structure only (avoids missing unknown endpoints).
  const responseHandler = async (response) => {
    const url = response.url();
    try {
      const headers = response.headers();
      const ct = headers["content-type"] || "";
      if (!ct.includes("application/json") && !ct.includes("text/plain")) return;

      const json = await response.json();
      if (!json) return;

      console.log(`  📡 JSON: ${url.split("?")[0]}`);  // debug: see all JSON URLs

      if (captured.workflow === null && !url.toLowerCase().includes("trigger")) {
        // Must have workflowData to avoid capturing unrelated GHL responses that
        // happen to contain _id (e.g. account/company onboarding data).
        if (json.workflowData || json.templateData || json.templates) {
          captured.workflow = json;
          console.log(`  ✅ Workflow JSON captured via CDP (${url.split("?")[0].split("/").slice(-2).join("/")})`);
        }
      }
      if (captured.trigger === null && url.toLowerCase().includes("trigger")) {
        captured.trigger = json;
        console.log(`  ✅ Trigger JSON captured via CDP`);
      }
    } catch (e) {}
  };

  page.on("response", responseHandler);

  const workflowUrl = `https://login.bucktoothmarketing.com/location/${locationId}/workflow/${wf.id}`;
  console.log(`  🌐 Navigating to: ${workflowUrl}`);

  try {
    await page.goto(workflowUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    console.log(`  ✔️  Page loaded: ${page.url()}`);
    console.log(`  🔄 Reloading to trigger fresh network requests...`);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    console.log(`  ✔️  After reload: ${page.url()}`);
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  } catch (e) {
    console.log(`  ⚠️ Navigation error: ${e.message}`);
  }

  // Poll up to 30s for CDP captures
  let waited = 0;
  while ((captured.workflow === null || captured.trigger === null) && waited < 30000) {
    await page.waitForTimeout(500);
    waited += 500;
  }

  page.off("response", responseHandler);

  // Approach 2: fetch interceptor fallback (window.__ghl_captures set by addInitScript).
  // Catches cases where GHL uses a bundled fetch or non-standard endpoint we missed above.
  if (captured.workflow === null || captured.trigger === null) {
    const pageCaptures = await page.evaluate(
      () => window.__ghl_captures || { workflow: null, trigger: null }
    ).catch(() => ({ workflow: null, trigger: null }));

    if (pageCaptures.workflow && captured.workflow === null) {
      captured.workflow = pageCaptures.workflow;
      console.log(`  ✅ Workflow JSON captured via fetch interceptor`);
    }
    if (pageCaptures.trigger && captured.trigger === null) {
      captured.trigger = pageCaptures.trigger;
      console.log(`  ✅ Trigger JSON captured via fetch interceptor`);
    }
  }

  // If trigger still missing, try to fetch it directly from Firebase using triggersFilePath
  if (captured.workflow && !captured.trigger && captured.workflow.triggersFilePath) {
    try {
      console.log(`  🔄 Fetching trigger from triggersFilePath...`);
      const fileUrl = captured.workflow.fileUrl || "";
      const baseMatch = fileUrl.match(/^(https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/)/);
      if (baseMatch) {
        const base = baseMatch[1];
        const triggerPath = encodeURIComponent(captured.workflow.triggersFilePath);
        const tokenMatch = fileUrl.match(/[?&]token=([^&]+)/);
        const tok = tokenMatch ? tokenMatch[1] : null;
        const triggerUrl = `${base}${triggerPath}?alt=media${tok ? `&token=${tok}` : ""}`;
        const res = await fetch(triggerUrl);
        if (res.ok) {
          captured.trigger = await res.json();
          console.log(`  ✅ Trigger JSON fetched from Firebase`);
        }
      }
    } catch (e) {
      console.log(`  ⚠️ Trigger fetch failed: ${e.message}`);
    }
  }

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
}

// ── Legacy single-workflow export (used by CLI main()) ─────────
async function exportWorkflow(wf, locationId, token, targetDir) {
  const AUTH = authFile(locationId);
  const browser = await chromium.launch({ headless: false });
  const context = fs.existsSync(AUTH)
    ? await browser.newContext({ storageState: AUTH })
    : await browser.newContext();
  const page = await context.newPage();

  let needsLogin = !fs.existsSync(AUTH);

  if (!needsLogin) {
    await page.goto(
      `https://login.bucktoothmarketing.com/location/${locationId}/workflow/${wf.id}`,
      { waitUntil: "domcontentloaded", timeout: 30000 }
    ).catch(() => {});

    if (isLoginPage(page.url())) {
      console.log("  ⚠️ Saved session expired — clearing stale auth and logging in fresh.");
      await context.clearCookies();
      await context.clearPermissions();
      try { fs.unlinkSync(AUTH); } catch (_) {}
      needsLogin = true;
    }
  }

  if (needsLogin) {
    await page.goto("https://login.bucktoothmarketing.com", { waitUntil: "domcontentloaded", timeout: 30000 });
  }

  const currentUrl = page.url();
  if (isLoginPage(currentUrl) || needsLogin) {
    console.log("\n👉 Browser mein login karo (email + password + OTP sab).");
    console.log("   ✋  OTP ke baad GHL /ai-employee-promo pe jayega — tabhi aage badhega.");
    try {
      await page.waitForURL(
        (url) => {
          const p = url.pathname;
          return p === "/ai-employee-promo" || p.startsWith("/location/") || p.startsWith("/agency");
        },
        { timeout: 300000 }
      );
    } catch {
      console.log("  ⚠️ Login timeout (5 min). Browser band ho raha hai.");
      await browser.close();
      return;
    }
    await context.storageState({ path: AUTH });
    console.log(`✅ Session saved → ${AUTH}`);
  }

  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  await exportWorkflowWithPage(wf, locationId, targetDir, page);
  await browser.close();
}

// ── CLI helper: prompt readline ────────────────────────────────
// (used only by main() below)

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
      await exportWorkflow(wf, locationId, token, subAccountOutputDir);
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