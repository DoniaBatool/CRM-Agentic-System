import fs from "fs/promises";
import path from "path";
import { chromium } from "playwright";
import { randomUUID } from "crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const TARGETS_FILE = path.join(DATA_DIR, "survey-targets.json");
const USERS_FILE = path.join(DATA_DIR, "test-users.json");
const QUESTIONS_FILE = path.join(DATA_DIR, "survey-conditional-questions.json");
const SETTINGS_FILE = path.join(DATA_DIR, "survey-agent-settings.json");

// Next.js can load this module in more than one compilation unit; keep sessions on globalThis
// so "open manual verify" and "continue" hit the same Map in one dev server process.
const SURVEY_SESSIONS =
  globalThis.__ghlSurveySessions ?? (globalThis.__ghlSurveySessions = new Map());

function chromiumEnvForAyla() {
  const env = { ...process.env };
  if (process.env.PLAYWRIGHT_SURVEY_BROWSER !== "chrome") {
    delete env.PLAYWRIGHT_CHROMIUM_CHANNEL;
  }
  return env;
}

async function launchAylaBrowser() {
  const useChrome = process.env.PLAYWRIGHT_SURVEY_BROWSER === "chrome";
  return chromium.launch({
    headless: false,
    channel: useChrome ? "chrome" : undefined,
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--window-position=80,80",
    ],
    env: chromiumEnvForAyla(),
  });
}

function assertSurveyNavigationOk(page, expectedUrl) {
  const u = page.url();
  if (!u || u === "about:blank" || u.startsWith("chrome://") || u.startsWith("chrome-error://")) {
    throw new Error(
      `The automation browser never left the empty start page (current URL: ${u || "empty"}). ` +
        `Look for the window Playwright opened (not your personal Chrome). ` +
        `If you intentionally use Google Chrome, set PLAYWRIGHT_SURVEY_BROWSER=chrome in .env. ` +
        `Otherwise remove PLAYWRIGHT_CHROMIUM_CHANNEL from your shell so bundled Chromium is used. ` +
        `Target was: ${expectedUrl}`
    );
  }
}

async function navigateToSurveyStart(page, url) {
  if (typeof page.bringToFront === "function") {
    await page.bringToFront().catch(() => {});
  }
  await page.goto(url, { waitUntil: "commit", timeout: 120000 });
  await page.waitForLoadState("domcontentloaded", { timeout: 120000 }).catch(() => {});
  await page.waitForLoadState("load", { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(400);
  assertSurveyNavigationOk(page, url);
}

function surveyHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

async function pickBestSurveyPage(context, targetUrl, fallbackPage) {
  const hintHost = surveyHostname(targetUrl);
  const pages = context.pages().filter((p) => !p.isClosed());
  if (!pages.length) {
    return fallbackPage && !fallbackPage.isClosed() ? fallbackPage : null;
  }

  async function scoreFor(p) {
    let score = 0;
    const u = p.url() || "";
    if (u === "about:blank") score -= 80;
    if (u.startsWith("chrome://") || u.startsWith("chrome-error://")) score -= 200;
    if (hintHost && u.includes(hintHost)) score += 250;
    if (u.includes("bucktoothmarketing.com")) score += 120;
    if (u.includes("challenges.cloudflare")) score += 100;
    if (u.includes("/widget/survey") || u.toLowerCase().includes("survey")) score += 50;

    const controls = await p
      .locator("input, select, textarea, button, [role='button'], iframe")
      .count()
      .catch(() => 0);
    score += Math.min(controls, 80);
    return score;
  }

  let best = pages[0];
  let bestScore = await scoreFor(best);
  for (const p of pages.slice(1)) {
    const s = await scoreFor(p);
    if (s > bestScore) {
      best = p;
      bestScore = s;
    }
  }

  if (bestScore < 0 && fallbackPage && !fallbackPage.isClosed()) {
    return fallbackPage;
  }
  return best;
}

async function resolveSessionWorkPage(session, targetUrl) {
  const { context, page: fallback } = session;
  await pageWaitShort(600);
  const picked = await pickBestSurveyPage(context, targetUrl, fallback);
  if (!picked || picked.isClosed()) {
    return null;
  }
  if (typeof picked.bringToFront === "function") {
    await picked.bringToFront().catch(() => {});
  }
  session.page = picked;
  return picked;
}

async function pageWaitShort(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function shutdownAllSurveySessions() {
  const entries = [...SURVEY_SESSIONS.entries()];
  for (const [, session] of entries) {
    await session.browser?.close().catch(() => {});
  }
  SURVEY_SESSIONS.clear();
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeText(input) {
  return String(input || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function randomItem(items = []) {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function randomFutureDate(daysAhead = 21) {
  const now = new Date();
  const dayOffset = Math.floor(Math.random() * daysAhead) + 1;
  now.setDate(now.getDate() + dayOffset);
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function randomPhone() {
  return `+1${Math.floor(1000000000 + Math.random() * 9000000000)}`;
}

function randomText(prefix = "Auto") {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getSurveyAgentConfig() {
  const [targetsData, usersData, questionsData, settingsData] = await Promise.all([
    readJson(TARGETS_FILE, { targets: [] }),
    readJson(USERS_FILE, { users: [] }),
    readJson(QUESTIONS_FILE, { targets: [] }),
    readJson(SETTINGS_FILE, {
      requireUserSelectionBeforeEachTarget: true,
      showUserListBeforeEachTarget: true,
      userFieldsToDisplay: ["firstName", "lastName", "email", "phone"],
    }),
  ]);

  const questionByTarget = Object.fromEntries(
    (questionsData.targets || []).map((entry) => [entry.targetId, entry])
  );

  const targets = (targetsData.targets || []).map((target) => ({
    ...target,
    config: questionByTarget[target.id] || {
      targetId: target.id,
      requiredQuestions: [],
      autoFillPolicy: {
        textInputs: "random",
        dropdowns: "random",
        checkboxes: "random",
        radioButtons: "random",
        calendar: "random-future",
      },
    },
  }));

  return {
    targets,
    users: usersData.users || [],
    settings: settingsData,
  };
}

async function fillKnownUserFields(page, user) {
  const firstName = user.firstName || "";
  const lastName = user.lastName || "";
  const email = user.email || "";
  const phone = user.phone || "";

  const fieldSelectors = [
    { selector: 'input[name*="first"], input[placeholder*="First"]', value: firstName },
    { selector: 'input[name*="last"], input[placeholder*="Last"]', value: lastName },
    { selector: 'input[type="email"], input[name*="email"], input[placeholder*="Email"]', value: email },
    { selector: 'input[type="tel"], input[name*="phone"], input[placeholder*="Phone"]', value: phone },
  ];

  for (const field of fieldSelectors) {
    const locator = page.locator(field.selector).first();
    if (await locator.count()) {
      const current = await locator.inputValue().catch(() => "");
      if (!current) {
        await locator.fill(field.value);
      }
    }
  }
}

async function answerRequiredQuestions(page, requiredQuestions = [], answers = {}) {
  for (const question of requiredQuestions) {
    if (!question.askUser) continue;
    const answer = answers[question.id];
    if (!answer) continue;

    const normalizedAnswer = normalizeText(answer);
    const answerByLabel = page
      .locator("label, button, div, span")
      .filter({ hasText: new RegExp(answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") })
      .first();

    if (await answerByLabel.count()) {
      await answerByLabel.click({ timeout: 2000 }).catch(() => {});
      continue;
    }

    const radios = page.locator('input[type="radio"]');
    const radioCount = await radios.count();
    for (let i = 0; i < radioCount; i += 1) {
      const radio = radios.nth(i);
      const value = normalizeText(await radio.getAttribute("value"));
      if (value && value.includes(normalizedAnswer)) {
        await radio.check().catch(() => {});
      }
    }
  }
}

async function uploadRequiredFiles(page, requiredUploads = []) {
  for (const upload of requiredUploads) {
    const relativePath = upload.filePath || "";
    const absolutePath = path.isAbsolute(relativePath)
      ? relativePath
      : path.join(process.cwd(), relativePath);

    const input = page.locator('input[type="file"]').first();
    if (await input.count()) {
      await input.setInputFiles(absolutePath).catch(() => {});
    }
  }
}

async function autoFillRemainingFields(page) {
  const textInputs = page.locator('input[type="text"], input:not([type]), textarea');
  const textCount = await textInputs.count();
  for (let i = 0; i < textCount; i += 1) {
    const el = textInputs.nth(i);
    const val = await el.inputValue().catch(() => "");
    if (val) continue;

    const name = normalizeText(await el.getAttribute("name"));
    const placeholder = normalizeText(await el.getAttribute("placeholder"));
    const combined = `${name} ${placeholder}`;

    if (combined.includes("email")) {
      await el.fill(`auto-${Math.random().toString(36).slice(2, 7)}@example.com`).catch(() => {});
    } else if (combined.includes("phone") || combined.includes("mobile")) {
      await el.fill(randomPhone()).catch(() => {});
    } else if (combined.includes("date")) {
      await el.fill(randomFutureDate()).catch(() => {});
    } else {
      await el.fill(randomText("answer")).catch(() => {});
    }
  }

  const dateInputs = page.locator('input[type="date"]');
  const dateCount = await dateInputs.count();
  for (let i = 0; i < dateCount; i += 1) {
    const el = dateInputs.nth(i);
    const val = await el.inputValue().catch(() => "");
    if (!val) {
      await el.fill(randomFutureDate()).catch(() => {});
    }
  }

  const selects = page.locator("select");
  const selectCount = await selects.count();
  for (let i = 0; i < selectCount; i += 1) {
    const sel = selects.nth(i);
    const options = await sel.locator("option").all();
    if (options.length <= 1) continue;
    const chosen = options[Math.floor(Math.random() * (options.length - 1)) + 1];
    const value = await chosen.getAttribute("value");
    if (value) {
      await sel.selectOption(value).catch(() => {});
    }
  }

  const uncheckedRadios = page.locator('input[type="radio"]:not(:checked)');
  const radioCount = await uncheckedRadios.count();
  if (radioCount) {
    await uncheckedRadios.nth(Math.floor(Math.random() * radioCount)).check().catch(() => {});
  }

  const uncheckedCheckboxes = page.locator('input[type="checkbox"]:not(:checked)');
  const checkboxCount = await uncheckedCheckboxes.count();
  if (checkboxCount) {
    const pick = Math.min(2, checkboxCount);
    for (let i = 0; i < pick; i += 1) {
      await uncheckedCheckboxes.nth(i).check().catch(() => {});
    }
  }
}

function getInteractionContexts(page) {
  return [page, ...page.frames()];
}

async function getOrderedContexts(page) {
  const contexts = getInteractionContexts(page);
  const scored = [];

  for (const ctx of contexts) {
    const url = typeof ctx.url === "function" ? ctx.url() : "";
    const controls = await ctx
      .locator("input, select, textarea, button, [role='button']")
      .count()
      .catch(() => 0);
    const priority =
      (url.includes("/widget/survey/") ? 30 : 0) +
      (url.includes("signup.bucktoothmarketing.com") ? 25 : 0) +
      (url.includes("api.bucktoothmarketing.com") ? 20 : 0) +
      controls;
    scored.push({ ctx, priority });
  }

  return scored.sort((a, b) => b.priority - a.priority).map((item) => item.ctx);
}

async function waitForInteractiveElements(page, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const contexts = await getOrderedContexts(page);
    for (const ctx of contexts) {
      const count = await ctx
        .locator("input, select, textarea, button, [role='button']")
        .count()
        .catch(() => 0);
      if (count > 0) return true;
    }
    await page.waitForTimeout(500);
  }
  return false;
}

async function isCloudflareChallengeActive(page) {
  const contexts = await getOrderedContexts(page);
  for (const ctx of contexts) {
    const url = typeof ctx.url === "function" ? ctx.url() : "";
    if (url.includes("challenges.cloudflare.com")) return true;
    const text = normalizeText(
      await ctx
        .locator("body")
        .innerText()
        .catch(() => "")
    );
    if (
      text.includes("performing security verification") ||
      text.includes("verifies you are not a bot") ||
      text.includes("cloudflare")
    ) {
      return true;
    }
  }
  return false;
}

async function waitForCloudflareResolution(page, timeoutMs = 180000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const active = await isCloudflareChallengeActive(page);
    if (!active) return true;
    await page.waitForTimeout(1000);
  }
  return false;
}

async function autoPickVisualOptions(page) {
  const contexts = await getOrderedContexts(page);
  for (const ctx of contexts) {
    const options = ctx.locator(
      "[role='radio'], [role='option'], button[aria-pressed='false'], .option, .answer, label"
    );
    const count = await options.count().catch(() => 0);
    if (!count) continue;
    for (let i = 0; i < Math.min(4, count); i += 1) {
      const candidate = options.nth(i);
      const text = normalizeText(await candidate.innerText().catch(() => ""));
      if (!text) continue;
      if (
        text.includes("next") ||
        text.includes("continue") ||
        text.includes("submit") ||
        text.includes("back")
      ) {
        continue;
      }
      await candidate.click({ timeout: 1200 }).catch(() => {});
      break;
    }
  }
}

async function runPostActions(page, postActions = [], answers = {}) {
  for (const action of postActions) {
    if (action.type !== "click-card-button") continue;
    const buttonText = action.buttonText || "Start 14-day trial";
    const answerValue = answers["plan-choice"];
    const targetKey = action.targetByAnswer?.[answerValue] || "";

    if (targetKey) {
      const card = page
        .locator("div,section,article")
        .filter({ hasText: new RegExp(targetKey, "i") })
        .first();
      if (await card.count()) {
        const button = card.getByRole("button", { name: new RegExp(buttonText, "i") }).first();
        if (await button.count()) {
          await button.click().catch(() => {});
          return true;
        }
      }
    }

    const fallback = page.getByRole("button", { name: new RegExp(buttonText, "i") }).first();
    if (await fallback.count()) {
      await fallback.click().catch(() => {});
      return true;
    }
  }

  return false;
}

async function clickProgressOrSubmit(page) {
  const labels = [
    /next/i,
    /continue/i,
    /submit/i,
    /start 14-day trial/i,
    /start trial/i,
    /finish/i,
  ];

  const contexts = await getOrderedContexts(page);
  for (const ctx of contexts) {
    for (const label of labels) {
      const roleButton = ctx.getByRole("button", { name: label }).first();
      if (await roleButton.count()) {
        await roleButton.click().catch(() => {});
        return true;
      }

      const genericButton = ctx
        .locator("button, [role='button'], a, div[tabindex='0']")
        .filter({ hasText: label })
        .first();
      if (await genericButton.count()) {
        await genericButton.click().catch(() => {});
        return true;
      }
    }
  }

  for (const ctx of contexts) {
    const generic = ctx.locator("button, [role='button'], a").filter({ hasNotText: /cloudflare|privacy/i });
    const count = await generic.count().catch(() => 0);
    if (count > 0) {
      const candidate = generic.nth(Math.max(0, count - 1));
      await candidate.click().catch(() => {});
      return true;
    }
  }

  await page.keyboard.press("Enter").catch(() => {});
  await page.waitForTimeout(300);

  for (const ctx of contexts) {
    const submitInput = ctx.locator('input[type="submit"], input[value*="Submit"]').first();
    if (await submitInput.count()) {
      await submitInput.click().catch(() => {});
      return true;
    }
  }

  return false;
}

async function getPageSignature(page) {
  const url = page.url();
  const contexts = await getOrderedContexts(page);
  let heading = "";
  let inputCount = 0;
  for (const ctx of contexts) {
    if (!heading) {
      heading = await ctx
        .locator("h1, h2, h3, [role='heading']")
        .first()
        .innerText()
        .catch(() => "");
    }
    inputCount += await ctx.locator("input, select, textarea").count().catch(() => 0);
  }
  return `${url}|${heading}|${inputCount}`;
}

async function runSingleTarget(page, target, user, targetConfig, answers, options = {}) {
  const { skipInitialNavigation = false } = options;

  if (!skipInitialNavigation) {
    await navigateToSurveyStart(page, target.url);
    await page.waitForLoadState("networkidle").catch(() => {});
    const clearedInitialChallenge = await waitForCloudflareResolution(page, 180000);
    if (!clearedInitialChallenge) {
      throw new Error(
        "Cloudflare verification not completed. Please solve verification in opened browser window, then run again."
      );
    }
  } else {
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});
  }

  await waitForInteractiveElements(page, 45000);
  await page.waitForTimeout(600);

  let previousSignature = await getPageSignature(page);
  let stagnantSteps = 0;
  let submitClicks = 0;

  for (let step = 0; step < 20; step += 1) {
    const challengeCleared = await waitForCloudflareResolution(page, 45000);
    if (!challengeCleared) {
      throw new Error(
        "Cloudflare verification re-appeared mid-run and was not cleared. Please complete verification and retry."
      );
    }
    const contexts = await getOrderedContexts(page);
    for (const ctx of contexts) {
      await fillKnownUserFields(ctx, user);
      await answerRequiredQuestions(ctx, targetConfig.requiredQuestions || [], answers || {});
      await uploadRequiredFiles(ctx, targetConfig.requiredUploads || []);
      await autoFillRemainingFields(ctx);
    }
    await autoPickVisualOptions(page);

    const handledPostAction = await runPostActions(
      page,
      targetConfig.postAnswerActions || [],
      answers || {}
    );
    if (handledPostAction) {
      await page.waitForTimeout(1000);
      const currentSignature = await getPageSignature(page);
      stagnantSteps = currentSignature === previousSignature ? stagnantSteps + 1 : 0;
      previousSignature = currentSignature;
      continue;
    }

    const clicked = await clickProgressOrSubmit(page);
    if (!clicked) {
      if (step < 3) {
        await page.waitForTimeout(1000);
        continue;
      }
      break;
    }
    submitClicks += 1;
    await page.waitForTimeout(1200);

    const currentSignature = await getPageSignature(page);
    stagnantSteps = currentSignature === previousSignature ? stagnantSteps + 1 : 0;
    previousSignature = currentSignature;

    if (stagnantSteps >= 2) {
      break;
    }
    if (submitClicks >= 5) {
      break;
    }
  }

  return {
    finalUrl: page.url(),
    submitClicks,
  };
}

export async function runSurveyTargets({
  targetIds = [],
  userByTarget = {},
  answersByTarget = {},
}) {
  const { targets, users, settings } = await getSurveyAgentConfig();
  const selectedTargets = targets.filter((target) => targetIds.includes(target.id));
  if (!selectedTargets.length) {
    throw new Error("No valid targets selected.");
  }

  const usersById = Object.fromEntries(users.map((u) => [u.id, u]));
  if (settings.requireUserSelectionBeforeEachTarget) {
    for (const target of selectedTargets) {
      if (!userByTarget[target.id] || !usersById[userByTarget[target.id]]) {
        throw new Error(`User selection missing for target: ${target.name}`);
      }
    }
  }

  const browser = await launchAylaBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const results = [];
  try {
    for (const target of selectedTargets) {
      const user = usersById[userByTarget[target.id]];
      const targetAnswers = answersByTarget[target.id] || {};
      const runResult = await Promise.race([
        runSingleTarget(page, target, user, target.config || {}, targetAnswers),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Target execution timeout after 300s")), 300000)
        ),
      ]);
      results.push({
        targetId: target.id,
        targetName: target.name,
        userId: user.id,
        userName: `${user.firstName} ${user.lastName}`,
        status: "submitted",
        finalUrl: runResult.finalUrl,
        submitClicks: runResult.submitClicks,
      });
    }
  } finally {
    await browser.close();
  }

  return {
    totalTargets: selectedTargets.length,
    submittedTargets: results.length,
    results,
  };
}

function cleanupExpiredSurveySessions() {
  const now = Date.now();
  for (const [id, session] of SURVEY_SESSIONS.entries()) {
    if (session.expiresAt <= now) {
      session.browser?.close().catch(() => {});
      SURVEY_SESSIONS.delete(id);
    }
  }
}

async function buildExecutionPlan({ targetIds = [], userByTarget = {}, answersByTarget = {} }) {
  const { targets, users, settings } = await getSurveyAgentConfig();
  const selectedTargets = targets.filter((target) => targetIds.includes(target.id));
  if (!selectedTargets.length) {
    throw new Error("No valid targets selected.");
  }

  const usersById = Object.fromEntries(users.map((u) => [u.id, u]));
  if (settings.requireUserSelectionBeforeEachTarget) {
    for (const target of selectedTargets) {
      if (!userByTarget[target.id] || !usersById[userByTarget[target.id]]) {
        throw new Error(`User selection missing for target: ${target.name}`);
      }
    }
  }

  return {
    selectedTargets,
    usersById,
    userByTarget,
    answersByTarget,
  };
}

export async function openSurveyTargetsForManualVerify({
  targetIds = [],
  userByTarget = {},
  answersByTarget = {},
}) {
  const guard =
    globalThis.__aylaManualVerifyOpening ?? (globalThis.__aylaManualVerifyOpening = { on: false });
  if (guard.on) {
    throw new Error(
      "Manual verify is already starting. Wait for the browser window, or close extra survey Chrome windows and click Open Manual Verify once."
    );
  }
  guard.on = true;
  try {
    await shutdownAllSurveySessions();

    const plan = await buildExecutionPlan({ targetIds, userByTarget, answersByTarget });

    const browser = await launchAylaBrowser();
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const initialPage = await context.newPage();

    try {
      await navigateToSurveyStart(initialPage, plan.selectedTargets[0].url);
    } catch (err) {
      await browser.close().catch(() => {});
      throw err;
    }

    await pageWaitShort(800);
    let workPage =
      (await pickBestSurveyPage(context, plan.selectedTargets[0].url, initialPage)) || initialPage;
    if (typeof workPage.bringToFront === "function") {
      await workPage.bringToFront().catch(() => {});
    }

    const sessionId = randomUUID();
    SURVEY_SESSIONS.set(sessionId, {
      sessionId,
      browser,
      context,
      page: workPage,
      plan,
      expiresAt: Date.now() + 30 * 60 * 1000,
    });

    return {
      sessionId,
      firstTargetName: plan.selectedTargets[0].name,
      firstTargetUrl: plan.selectedTargets[0].url,
      totalTargets: plan.selectedTargets.length,
    };
  } finally {
    guard.on = false;
  }
}

export async function continueSurveyTargetsAfterManualVerify({ sessionId }) {
  cleanupExpiredSurveySessions();
  const session = SURVEY_SESSIONS.get(sessionId);
  if (!session) {
    throw new Error("Survey session not found or expired. Please open manual verify again.");
  }

  const { browser, plan } = session;

  if (!browser.isConnected()) {
    SURVEY_SESSIONS.delete(sessionId);
    throw new Error(
      "Browser disconnected (closed or crashed). Open Manual Verify again and keep the window open until auto-fill finishes."
    );
  }

  const page = await resolveSessionWorkPage(session, plan.selectedTargets[0].url);
  if (!page || page.isClosed()) {
    SURVEY_SESSIONS.delete(sessionId);
    await browser.close().catch(() => {});
    throw new Error(
      "No live survey tab found (wrong window may have been focused, or the tab closed). Close all extra Chrome windows, open Manual Verify once, complete Cloudflare in that window only, then Continue."
    );
  }

  const results = [];

  try {
    for (let i = 0; i < plan.selectedTargets.length; i += 1) {
      const target = plan.selectedTargets[i];
      const user = plan.usersById[plan.userByTarget[target.id]];
      const targetAnswers = plan.answersByTarget[target.id] || {};
      const skipInitialNavigation = i === 0;

      const runResult = await Promise.race([
        runSingleTarget(session.page, target, user, target.config || {}, targetAnswers, {
          skipInitialNavigation,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Target execution timeout after 300s")), 300000)
        ),
      ]);

      results.push({
        targetId: target.id,
        targetName: target.name,
        userId: user.id,
        userName: `${user.firstName} ${user.lastName}`,
        status: "submitted",
        finalUrl: runResult.finalUrl,
        submitClicks: runResult.submitClicks,
      });
    }
  } catch (err) {
    SURVEY_SESSIONS.delete(sessionId);
    await browser.close().catch(() => {});
    throw err;
  }

  await browser.close().catch(() => {});
  SURVEY_SESSIONS.delete(sessionId);

  return {
    totalTargets: plan.selectedTargets.length,
    submittedTargets: results.length,
    results,
  };
}
