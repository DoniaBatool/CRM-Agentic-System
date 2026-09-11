# DentaFlow — Agent Learnings (Unified)
## All Agent Technical Reference & Gotchas

---

# Echo — Workflow Export Specialist
## Agent Context for Luna (Orchestrator Routing)

---

## Who Is Echo?

Echo is the **GHL Workflow Export Specialist**. His job is to export GoHighLevel (GHL) automation workflows as JSON files so they can be backed up, analyzed, debugged, or transferred.

Echo works with the `workflow-export` agent ID and has a dedicated 2-column UI panel in the frontend.

---

## What Echo Can Do

### 1. List Workflows from GHL
Fetches all automation workflows from a GHL sub-account using the PIT (Personal Integration Token) and Location ID.

**User phrases that mean this:**
- "show me workflows"
- "load workflows from GHL"
- "what workflows are in [sub-account]?"
- "list all automation workflows"
- "fetch workflows"

**What Echo needs:** Sub-account name, Location ID, PIT token

---

### 2. Export Workflow JSON
Saves individual or bulk workflow JSON (including trigger data) to local files under `workflows/[sub-account-name]/`.

Each saved JSON file contains:
```json
{
  "workflow_id": "uuid",
  "workflow_name": "Nurtura - D: Login Email",
  "location_id": "ghl-location-id",
  "exported_at": "ISO timestamp",
  "workflow_json": { "workflowData": { "templates": [...] } },
  "trigger_json": [{ "type": "opportunity_created", ... }]
}
```

**User phrases that mean this:**
- "export this workflow"
- "save workflow JSON"
- "backup workflows"
- "export selected workflows"
- "download workflow data"
- "save [workflow name] to file"

**What Echo needs:** Selected workflow IDs, sub-account name, Location ID, PIT token

---

### 3. View Exported Workflow JSON
Reads a saved JSON file and shows its full content in the chat interface.

**User phrases that mean this:**
- "show me the JSON for [workflow name]"
- "view exported workflow"
- "open [workflow name] JSON"
- "what does this workflow look like?"
- "load exported JSON"
- "read the saved workflow"

---

### 4. List Saved Exports
Shows which workflow JSON files have already been exported and saved locally.

**User phrases that mean this:**
- "what's been exported?"
- "list exported workflows"
- "show saved JSON files"
- "which workflows do I have backed up?"

---

### 5. Delete Exported Files
Removes saved JSON files from the local storage.

**User phrases that mean this:**
- "delete exported JSON"
- "remove saved workflows"
- "clear workflow files"

---

## When Luna Should Route to Echo

Route to Echo (`workflow-export`) when the user's message contains intent around:

| Intent | Example Phrases |
|--------|-----------------|
| Export/backup workflows | "export workflows", "backup GHL", "save workflow JSON" |
| View/read workflow JSON | "show workflow JSON", "view exported", "open workflow file" |
| List GHL workflows | "list workflows", "show all workflows", "fetch workflows from GHL" |
| Manage saved files | "load exported JSON", "delete workflow JSON", "list exported files" |
| Workflow data/structure | "what triggers this workflow", "show workflow steps", "workflow templates" |

**Do NOT route to Echo for:**
- Workflow *testing* (that's Sara — webhook triggers)
- Workflow *understanding/explanation* (that's Veronica — platform brain)
- Workflow *debugging* (that's Veronica)
- Creating or editing workflows (GHL UI only — no agent handles this)

---

## Technical Architecture

### Files
```
workflow-agent.js              ← All Echo business logic (pure functions)
lib/agent-handlers.js          ← Echo handler block (agentId === "workflow-export")
components/ChatPanel.js        ← Echo UI panel (2-column layout, tabs, buttons)
app/globals.css                ← Echo-specific CSS (echo-panel, echo-tabs, resize handle)
```

### Actions (context.action values)
| Action | What it does |
|--------|--------------|
| `list-workflows` | Fetches all workflows from GHL API using locationId + token |
| `export-selected` | Exports selected workflow IDs to JSON files |
| `list-sub-accounts` | Scans `workflows/` dir, returns available sub-account folder names |
| `list-exported-json` | Lists JSON files in a sub-account folder (fuzzy folder match) |
| `load-json-content` | Reads a specific JSON file, returns full content for chat display |
| `delete-selected-json` | Deletes specified JSON files from sub-account folder |

### Export Strategy (API-first, Playwright fallback)
1. **Phase 1 — API**: Tries `fetchWorkflowViaApi()` for each workflow. Uses PIT token directly. Gets trigger JSON from Firebase Storage URL embedded in response.
2. **Phase 2 — Playwright**: If API returns wrong/missing `workflowData`, launches headless Chromium, logs into GHL, intercepts network traffic to capture the real workflow JSON.

### Authentication
- Auth session saved per location: `auth-{locationId}.json`
- Different sub-accounts (different locationIds) get separate session files — no cross-contamination
- Same locationId reuses saved session — user only logs in once per account
- OTP/2FA supported: `waitForURL` whitelists `/location/`, `/agency`, `/ai-employee-promo` paths only

### Folder Structure for Saved Files
```
workflows/
└── {sanitized-sub-account-name}/    ← lowercase, special chars → "_"
    ├── Nurtura - D_ Login Email on subaccount-created.json
    ├── Workflow # 1_ New Lead on Survey Submission.json
    └── ...
```
Filename derived from: `wf.name.replace(/[<>:"/\\|?*]+/g, "_") + ".json"`

### Valid Workflow JSON Structure
A correctly exported workflow file must have `workflowData.templates` array:
```json
{
  "workflow_json": {
    "_id": "uuid",
    "workflowData": {
      "templates": [
        { "type": "if_else", "conditions": [...] },
        { "type": "add_contact_tag", "tag": "..." }
      ]
    }
  }
}
```
If `workflowData` is missing → export failed → need Playwright fallback.

---

## UI Capabilities (what the user sees)

### Echo Panel (left side, 2-column layout)
- **3 input fields**: Sub-account name (dropdown once folders exist), Location ID, PIT token
- **4 action buttons**: Load Workflows | Export Selected | Load Exported JSON | Delete Selected JSON
- **2 tabs**:
  - **GHL Workflows** — all workflows from GHL with search + checkboxes
  - **Exported JSONs** — saved files list with View button per row

### Chat (right side)
- Shows export progress, success/error messages
- Displays full JSON content when user views a file (with syntax-highlighted code block)
- Shows workflow name + ID + step count + trigger type on view

### Smart button behavior
- **Load Exported JSON** with workflows checked → shows their JSON in chat
- **Load Exported JSON** with nothing checked → lists all saved files, switches to Exported JSONs tab
- **Delete Selected JSON** with workflows checked → deletes their files (with confirm dialog)
- **Delete Selected JSON** with files checked in Exported tab → deletes those files
- Auto-switches to correct tab after each action

---

## Key GHL API Facts

| Fact | Detail |
|------|--------|
| Workflow list endpoint | `GET /workflows/?locationId={id}` |
| Single workflow endpoint | Does NOT reliably work — returns company data instead |
| Trigger endpoint | Contains "trigger" in URL, returns an array not object |
| Auth domain | `login.bucktoothmarketing.com` used for ALL pages (login + dashboard + workflow) |
| Workflow JSON field | Must check `json.workflowData` — never `json._id` alone |

---

## Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `workflow_json: null` | `json._id` check captured company data | Only accept `json.workflowData` |
| `trigger_json: null` | API trigger URL not intercepted | Fetch from `triggersFilePath` in Firebase Storage |
| "Found 0 exported JSON files" | Folder name mismatch (typo/case) | Fuzzy match against available folders |
| Duplicate folder created | Same name different capitalization | `sanitizeSubAccountName` lowercases everything |
| Login loop / browser closes early | OTP page URL matched post-login check | Whitelist approach: only resolve on `/location/` or `/agency` paths |
| "API returned wrong workflow" | GHL single-workflow API returns account data | Require `workflowJson.workflowData` AND `workflowJson._id === wf.id` |

---

## Environment Variables Echo Needs

```env
# No special env vars needed for Echo itself
# Echo uses user-provided values at runtime:
# - Location ID (entered in UI)
# - PIT token (entered in UI)
# - Sub-account name (entered in UI or selected from dropdown)

# GHL base URL (optional, defaults to services.leadconnectorhq.com)
GHL_BASE_URL=https://services.leadconnectorhq.com
GHL_API_VERSION=2021-07-28
```

---

## What Echo Does NOT Do

- ❌ Does not create or modify GHL workflows
- ❌ Does not test workflows (→ Sara handles webhook triggers)
- ❌ Does not explain what a workflow does (→ Veronica handles workflow analysis)
- ❌ Does not sync to any database (exports to local `workflows/` folder only)
- ❌ Does not schedule exports (one-time manual action)
- ❌ Does not export contacts, pipelines, or any other GHL data — workflows only

---

## Luna's Routing Decision Tree for Echo

```
User message contains any of:
  "export" + "workflow"     → Echo
  "backup" + "GHL"          → Echo
  "save" + "workflow JSON"  → Echo
  "workflow JSON"            → Echo (if asking to view/get)
  "list workflows"           → Echo (if from GHL, not local Veronica catalog)
  "load exported"            → Echo
  "exported JSON"            → Echo
  "workflow file"            → Echo

But NOT:
  "test workflow"            → Sara (webhook trigger)
  "debug workflow"           → Veronica
  "explain workflow"         → Veronica
  "what does workflow do"    → Veronica
  "workflow not working"     → Veronica
```

---

---

# Veronica — Platform Brain & Workflow Intelligence

## Who Is Veronica?

Veronica is the **Platform Brain** of DentaFlow. She combines GHL knowledge, workflow analysis, web search, and AI-powered explain/debug into a single agent. She has a structured UI panel for browsing exported workflows and analyzing them through dual AI sources (NotebookLM + OpenAI).

Agent ID: `veronica` | Panel: folder-browser above chat area

---

## What Veronica Can Do

### 1. General GHL Q&A
Answer any GHL question using NotebookLM (user's notebooks) + OpenAI web search.
Tools used: `learnGhlTool` → `askGhlAssistant` (NotebookLM), `webSearchTool` (OpenAI)

### 2. Explain a Specific Workflow (Panel)
Select workflow from panel → click Explain → dual-source analysis:
- **🧠 NotebookLM** — context from user's GHL notebooks
- **🤖 AI Analysis** — OpenAI `gpt-4o-mini` reading the raw JSON directly
Both run in parallel via `Promise.all`.

### 3. Debug a Specific Workflow (Panel)
Select workflow → enter issue → click Debug. Same dual-source pattern.
OpenAI identifies: (1) what works, (2) potential issues, (3) suggested fixes.

### 4. Browse Sub-Accounts & Workflow Files
Panel auto-loads all sub-account folders from `workflows/` on agent switch.
Click folder → workflow list loads → click workflow → Explain/Debug area appears.

### 5. Web Search
Uses `webSearchTool` from `@openai/agents`. **Do NOT add Tavily** — already covered.

### 6. Workflow Analysis Tools (via SDK chat)
`workflow_visual_map`, `workflow_analyzer_report`, `generate_learning_assets`, `check_context7_status`

---

## Architecture — 3-File Pattern

| File | Purpose |
|---|---|
| `lib/veronica-agent.js` | All pure functions (testable, no SDK) |
| `lib/agents/veronica.js` | OpenAI Agents SDK wrapper — tools + Agent instance |
| `lib/agent-handlers.js` | Handler routing — pre-SDK block + SDK fallthrough |

---

## Critical Routing Rule — Pre-SDK Block

All agents in `SDK_AGENTS` get intercepted by OpenAI SDK BEFORE any `if (agentId === "veronica")` block. Panel actions (`browse-sub-accounts`, `list-workflows-in-folder`, `explain-workflow`, `debug-workflow`) must be handled in a **pre-SDK block BEFORE `const SDK_AGENTS = {...}`**:

```js
if (agentId === "veronica") {
  if (context.action === "browse-sub-accounts") { ... return; }
  if (context.action === "list-workflows-in-folder") { ... return; }
  if (context.action === "explain-workflow") { ... return; }
  if (context.action === "debug-workflow") { ... return; }
  // intent detection → return early OR fall through to SDK
}
// const SDK_AGENTS = { veronica: veronicaAgent, ... }
```

---

## Intent Detection (pre-SDK)

| Regex match | Result |
|---|---|
| "want to debug a workflow" | Returns `veronica_clarify` card |
| "want to debug a specific workflow" | Returns `veronica_sub_accounts` card (mode=debug) |
| "want to explain a workflow" | Returns `veronica_clarify` card |
| "want to explain a specific workflow" | Returns `veronica_sub_accounts` card (mode=explain) |
| None of above | Falls through to OpenAI SDK |

---

## Panel Data Cards

| context.action | data.type | Renders |
|---|---|---|
| `browse-sub-accounts` | `veronica_sub_accounts` | Folder buttons in message bubble |
| `list-workflows-in-folder` | `veronica_workflow_list` | Workflow buttons in message bubble |
| `explain-workflow` | plain text | Dual-source explanation |
| `debug-workflow` | plain text | Dual-source debug report |

Messages carry `cardData: data.data || null`. ChatPanel renders based on `card?.type`.

---

## Pure Functions in veronica-agent.js

| Function | What it does |
|---|---|
| `browseSubAccountsAsync()` | Reads `workflows/` dir → `{ subAccounts: string[] }` |
| `listWorkflowsInFolder(folderName)` | Lists JSONs in subfolder → `{ workflows: [{fileName, workflowName, fullPath}] }` |
| `loadWorkflowCatalog()` | Recursively collects all `.json` files from `workflows/` |
| `explainExistingWorkflows()` | Lists all workflows grouped by folder |
| `diagnoseWorkflowIssue(message, context)` | Keyword-match → NotebookLM + Context7 debug |
| `explainWorkflowVisualMap(message, context)` | Chain-map: nodes, triggers, happy/failure paths |
| `generateEndToEndWorkflowReport(mode)` | Full or brief system-wide workflow analysis |
| `explainWorkflowFile(parsedJson)` | Dual-source explain: NotebookLM + OpenAI parallel |
| `debugWorkflowFile(parsedJson, userMessage)` | Dual-source debug: NotebookLM + OpenAI parallel |
| `cleanNlmOutput(raw)` | Strips prompt echo + box-drawing chars from nlm output |
| `analyzeWithOpenAI(systemPrompt, userContent)` | Calls `gpt-4o-mini` directly for workflow analysis |
| `queryContext7(question, workflow)` | GHL API docs from Context7 (general Q&A only, NOT explain/debug) |

---

## Dual-Source Response Format

```
## WorkflowName

### 🧠 NotebookLM
[Clean notebook response]

### 🤖 AI Analysis
[gpt-4o-mini direct JSON analysis]
```

---

## Context7 Usage Rule

**USE:** `diagnoseWorkflowIssue` (general keyword-based Q&A, API reference helps)
**DO NOT USE:** `explainWorkflowFile`, `debugWorkflowFile` — returns generic API docs, not workflow-specific analysis

---

## NotebookLM Notes

`askGhlAssistant` runs `nlm cross query --notebooks {id1},{id2} "{question}"`.
Two notebooks: `GoHighLevel` + `GoHighLevel AI Employee`.

**Atlas/Echo in responses:** Normal — notebooks contain DentaFlow docs that mention all agents. Not active agents, just source document references.

---

## CSS Panel — Scroll Fix

```css
.veronica-browser {
  height: 190px; /* REQUIRED — without this, overflow-y: auto never fires */
}
.veronica-folders,
.veronica-wf-list {
  min-height: 0;
  height: 100%;
  overflow-y: auto;
}
```

Veronica panel renders ABOVE the chat messages div in JSX.

---

## OpenAI Client — Lazy Creation

Create inside the function, not at module level — env var must be read at call time:
```js
async function analyzeWithOpenAI(...) {
  if (!process.env.OPENAI_API_KEY) return null;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  ...
}
```

---

## Test Mocking

```js
vi.mock("../ghl-assistant.js", () => ({
  askGhlAssistant: vi.fn().mockResolvedValue("2/2 notebooks responded\nMock GHL answer"),
}));
vi.mock("openai", () => ({
  default: class OpenAI {
    constructor() {
      this.chat = { completions: { create: vi.fn().mockResolvedValue({
        choices: [{ message: { content: "Mock OpenAI analysis" } }],
      }) } };
    }
  },
}));
```

Set `process.env.OPENAI_API_KEY = "test-key"` in `beforeEach`.
The mock for `askGhlAssistant` must include `"2/2 notebooks responded\n"` prefix so `cleanNlmOutput` strips it correctly.
