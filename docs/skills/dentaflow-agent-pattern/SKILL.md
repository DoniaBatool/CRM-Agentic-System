---
name: dentaflow-agent-pattern
description: >
  Architecture guide for adding or editing agents in the DentaFlow / ghl-mcp-server codebase.
  Use this skill whenever working in the ghl-mcp-server project and the user wants to add a new
  agent, edit an existing agent file (lib/agents/, lib/agent-handlers.js, lib/*-agent.js),
  register an agent in the SDK_AGENTS map, add orchestrator keywords, or debug routing issues.
  Also trigger for phrases like "add [name] agent", "build iris/dash/cal/max/rex/nora/sara/veronica",
  "new agent for DentaFlow", "lib/agents pattern", "SDK_AGENTS map", or any question about
  the 3-file agent architecture (pure functions + SDK wrapper + handler registration).
  This skill contains the exact file templates, checklists, gotchas, and current agent registry
  for the DentaFlow project — always use it instead of guessing the project conventions.
---

# DentaFlow Agent Pattern

## SCOPE
This skill is for the `ghl-mcp-server` (DentaFlow) codebase ONLY.

For the universal OpenAI Agents SDK reference (tools, guardrails, hooks, handoffs, models, MCP, HITL, voice), read:
`docs/skills/openai-agents-sdk/SKILL.md`

---

## TRIGGER CONDITIONS

Use this skill when:
- Adding a new agent to DentaFlow
- Editing `lib/agents/`, `lib/agent-handlers.js`, or any `lib/[name]-agent.js`
- User asks "add [name] agent to the project"
- Debugging routing / SDK_AGENTS map issues in DentaFlow

---

## THE 3-FILE PATTERN

Every DentaFlow agent spans exactly 3 files:

```
lib/
├── [name]-agent.js          ← Pure functions (testable, no SDK)
└── agents/
    └── [name].js            ← SDK wrapper (Agent + tools)

lib/agent-handlers.js        ← Register in SDK_AGENTS map
```

### Why this separation?
- Pure functions → testable without SDK or OpenAI API key
- SDK wrapper → just wiring, minimal logic
- Agent behavior → tested via integration/eval if needed

---

## FILE 1: Pure Functions (`lib/[name]-agent.js`)

```javascript
import { getSupabase } from "./supabase.js";

// Main business logic — no SDK imports here
export async function doMainTask({ param }) {
  const sb = getSupabase();
  if (!sb) return { success: true, dev: true, message: "Dev mode" }; // dev fallback

  const { data, error } = await sb.from("table").select("*");
  if (error) throw new Error(error.message);
  return { success: true, data };
}

export async function helperFunction({ id }) {
  const sb = getSupabase();
  if (!sb) return { found: false };
  // ...real logic...
}

// Always include a status/config check function
export function getAgentConfig() {
  return {
    connected: Boolean(process.env.RELEVANT_API_KEY),
    feature: "description of what this agent does",
  };
}
```

**Rules:**
- Every Supabase call: `if (!sb) return fallback` — never assume Supabase is live
- Pure functions throw errors on failure — never silently return wrong data
- Export individual named functions — no default export

---

## FILE 2: SDK Wrapper (`lib/agents/[name].js`)

```javascript
import { Agent, tool } from "@openai/agents";
import { z } from "zod";
import { doMainTask, helperFunction, getAgentConfig } from "../[name]-agent.js";

// Tool 1
const doMainTaskTool = tool({
  name: "do_main_task",
  description: "Does the main task. When to call: when user asks for X.",
  parameters: z.object({
    param: z.string().describe("The parameter description"),
  }),
  execute: async ({ param }) => {
    const result = await doMainTask({ param });
    return JSON.stringify(result);
  },
});

// Tool 2
const helperTool = tool({
  name: "helper_function",
  description: "Gets helper data. When to call: when user needs Y.",
  parameters: z.object({
    id: z.string().describe("The ID to look up"),
  }),
  execute: async ({ id }) => {
    const result = await helperFunction({ id });
    return JSON.stringify(result);
  },
});

// Status tool (every agent has this)
const getStatusTool = tool({
  name: "get_status",
  description: "Check agent status and configuration.",
  parameters: z.object({}),
  execute: async () => {
    return JSON.stringify(getAgentConfig());
  },
});

export const nameAgent = new Agent({
  name: "AgentName",
  instructions: `You are [Name], the [role] for DentaFlow.

Your primary responsibilities:
- [Responsibility 1]
- [Responsibility 2]

Your tools:
- do_main_task: Use when the user asks for X
- helper_function: Use when the user needs Y
- get_status: Use to check your configuration

Guardrails:
- Never do X
- Always confirm before doing Y
- If unsure, ask the user to clarify`,
  tools: [doMainTaskTool, helperTool, getStatusTool],
});
```

**Rules:**
- Every tool's `execute` returns `JSON.stringify(result)` — never raw objects
- Tool `description` must include "When to call: ..." — helps LLM decide
- Instructions must list all tools with when-to-use guidance
- Named export matches agent name: `export const nameAgent`

---

## FILE 3: Register in SDK_AGENTS (`lib/agent-handlers.js`)

```javascript
// At the top with other SDK agent imports:
import { nameAgent } from "./agents/name.js";

// In the SDK_AGENTS map:
const SDK_AGENTS = {
  // ... existing agents
  name: nameAgent,           // key = agent ID used in orchestrator
};
```

**Rules:**
- Key must match the agent ID in `lib/orchestrator.js` keywords
- Do NOT add to the explicit `if (agentId === ...)` blocks below — SDK_AGENTS handles it
- Echo (`workflow-export`) and Ayla (`survey-tester`) are intentionally NOT in SDK_AGENTS

---

## STEP 4: Add Keywords to Orchestrator (`lib/orchestrator.js`)

```javascript
// In the keywords map, add a new entry:
"name": [
  "keyword one",
  "keyword two",
  "specific phrase",
  // ⚠️ AVOID single common words — they substring-match!
  // BAD: "book" (matches "facebook", "notebook")
  // BAD: "board" (matches "onboarding")
  // GOOD: "book meeting", "book appointment"
],
```

---

## STEP 5: Add to agents.js (`lib/agents.js`)

```javascript
{
  id: "name",
  name: "AgentName",
  role: "Short role description",
  intro: "Hi! I'm AgentName. I help you with [specific tasks]. Just ask!",
},
```

---

## STEP 6: Write Tests (`tests/[name]-agent.test.js`)

See `docs/patterns/agent-tests.md` for the full test boilerplate.

Minimum coverage required:
- Happy path for each exported function
- Supabase null fallback (dev mode) for every DB function
- Error handling (Supabase throws, API fails)
- Edge cases (empty input, missing fields)

Run after every change:
```bash
npm test
```
All tests must pass before committing.

---

## AGENT CHECKLIST

```
[ ] lib/[name]-agent.js        — pure functions, Supabase fallbacks, getAgentConfig()
[ ] lib/agents/[name].js       — SDK wrapper, all tools, instructions with when-to-use
[ ] lib/agent-handlers.js      — added to SDK_AGENTS map
[ ] lib/orchestrator.js        — keywords added (specific phrases, not single words)
[ ] lib/agents.js              — agent definition added
[ ] tests/[name]-agent.test.js — tests written and passing
[ ] npm test                   — all tests pass (300+)
[ ] CLAUDE.md                  — any new gotchas documented
```

---

## CURRENT AGENT REGISTRY

| Agent | ID | SDK? | Files |
|---|---|---|---|
| Luna | `orchestrator` | No (keyword routing) | `lib/orchestrator.js` |
| Veronica | `veronica` | YES | `lib/agents/veronica.js` + `lib/veronica-agent.js` |
| Echo | `workflow-export` | NO (Playwright) | `workflow-agent.js` |
| Ayla | `survey-tester` | NO (Playwright) | `lib/survey-agent.js` |
| Sara | `workflow-tester` | YES | `lib/agents/sara.js` |
| Rex | `rex` | YES | `lib/agents/rex.js` + `lib/rex-agent.js` |
| Nora | `nora` | YES | `lib/agents/nora.js` + `lib/nora-agent.js` |
| Max | `max` | YES | `lib/agents/max.js` + `lib/max-agent.js` |
| Cal | `cal` | YES | `lib/agents/cal.js` + `lib/cal-agent.js` |
| Iris | `iris` | YES | `lib/agents/iris.js` + `lib/iris-agent.js` |
| Dash | `dash` | YES | `lib/agents/dash.js` + `lib/dash-agent.js` |
| Atlas | `atlas` | future | — |

Echo and Ayla run Playwright browser automation — they must stay on their own handlers, NOT in SDK_AGENTS.

---

## GOTCHAS (DentaFlow-specific)

### Orchestrator keyword matching
Keywords are substring-matched against the full user message (lowercased). Single words are dangerous:
- `"book"` matches inside `"facebook"`, `"notebook"` → use `"book appointment"`, `"book meeting"`
- `"board"` matches inside `"onboarding"` → use `"kanban"`, `"pipeline"`, `"move stage"`
- `"onboard"` matches inside `"onboarding"` content requests → use `"onboard client"`, `"setup client"`

### Supabase null pattern
Every Supabase call must check `if (!sb) return fallback`. This allows:
- Tests to run without a live DB connection
- Dev mode to work without env vars
- Graceful degradation in production if Supabase is down

### Stage transitions (Dash agent)
`VALID_TRANSITIONS` map enforces pipeline business logic. `client_won` is terminal.
Never add a transition without checking the business rules first.

### Nova merged into Veronica
`if (agentId === "ghl-assistant") agentId = "veronica"` exists in `agent-handlers.js` for backward compatibility. Never remove this redirect.

### vi.mock() patterns for tests
See CLAUDE.md Learnings sections 3, 11 for the exact mock patterns required for OpenAI and fs/promises.

### `zod@^4` required
`@openai/agents` v0.11+ requires `zod@^4.0.0`. Install with `--legacy-peer-deps`.
