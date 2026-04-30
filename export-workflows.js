import { chromium } from "playwright";
import fs from "fs";

const LOCATION_ID = "06zrbOC2XQ3k0cWNhYzU";
const AUTH_FILE = "auth.json";
const OUTPUT_DIR = "workflows";

const WORKFLOWS = [
  { id: "509564c5-7331-40e2-8bb1-77afcb05bcad", name: "WF-01a Survey Intake" },
];

(async () => {
  const browser = await chromium.launch({ headless: false });

  const context = fs.existsSync(AUTH_FILE)
    ? await browser.newContext({ storageState: AUTH_FILE })
    : await browser.newContext();

  const page = await context.newPage();

  if (!fs.existsSync(AUTH_FILE)) {
    await page.goto("https://login.bucktoothmarketing.com");
    console.log("👉 Browser mein login karo, phir terminal mein ENTER dabao...");
    await new Promise(resolve => process.stdin.once("data", resolve));
    await context.storageState({ path: AUTH_FILE });
    console.log("✅ Session saved!");
  }

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

  for (const wf of WORKFLOWS) {
    console.log(`\n⏳ Processing: ${wf.name}`);

    const captured = { workflow: null, trigger: null };

    // Response listener PEHLE set karo
    const responseHandler = async (response) => {
      const url = response.url();
      try {
        if (url.includes(wf.id) && !url.includes("trigger") && captured.workflow === null) {
          const json = await response.json();
          captured.workflow = json;
          console.log(`  ✅ Workflow JSON captured`);
        }
        if (url.includes("trigger") && url.includes(wf.id) && captured.trigger === null) {
          const json = await response.json();
          captured.trigger = json;
          console.log(`  ✅ Trigger JSON captured`);
        }
      } catch (e) {}
    };

    page.on("response", responseHandler);

    // Navigate
    try {
      await page.goto(
        `https://login.bucktoothmarketing.com/location/${LOCATION_ID}/workflow/${wf.id}`,
        { waitUntil: "domcontentloaded", timeout: 60000 }
      );
    } catch (e) {
      console.log(`  ⚠️ Navigation warning: ${e.message}`);
    }

    // Wait for JSON to be captured
    let waited = 0;
    while ((captured.workflow === null || captured.trigger === null) && waited < 15000) {
      await page.waitForTimeout(500);
      waited += 500;
    }

    // Remove listener
    page.off("response", responseHandler);

    // Save
    const safeName = wf.name.replace(/[<>:"/\\|?*]+/g, "_");
    const output = {
      workflow_id: wf.id,
      workflow_name: wf.name,
      location_id: LOCATION_ID,
      exported_at: new Date().toISOString(),
      workflow_json: captured.workflow,
      trigger_json: captured.trigger,
    };

    fs.writeFileSync(
      `${OUTPUT_DIR}/${safeName}.json`,
      JSON.stringify(output, null, 2)
    );
    console.log(`  💾 Saved: ${safeName}.json`);

    await page.waitForTimeout(2000);
  }

  console.log("\n🎉 All workflows exported!");
  await browser.close();
})();;