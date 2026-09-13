# DentaFlow — Agentic Platform

## What This Project Is

A multi-agent platform that automates dental marketing agency operations and dental business management.

**Two systems in one codebase:**
1. **Agency System** — Donia's internal tool: pipeline, social media, lead intake, follow-ups
2. **Dental Client System** — Per dental business: website, WhatsApp agent, patient bookings, reminders (future phase)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router) |
| Backend agents | Node.js ES Modules |
| Database | Supabase (PostgreSQL) |
| Email | Brevo (free tier) |
| WhatsApp | Twilio |
| Social Media | Meta Graph API + Canva MCP |
| Calendar | Google Calendar API |
| Testing | Vitest |
| Deploy | Vercel (frontend) + Render (backend) |

---

## Project Structure

```
ghl-mcp-server/
├── app/                        ← Next.js frontend
│   ├── api/chat/route.js       ← Main API endpoint (routes to agents)
│   ├── page.js                 ← Chat UI
│   └── globals.css
├── components/
│   ├── ChatPanel.js            ← Chat interface
│   └── AgentSidebar.js         ← Agent selector
├── lib/                        ← All agent logic
│   ├── agents/                 ← OpenAI Agents SDK wrappers (one per agent)
│   │   ├── iris.js             ← Iris SDK agent (tools: processIntake, getRecentLeads, ...)
│   │   ├── dash.js             ← Dash SDK agent (tools: moveLeadStage, getBoardData, ...)
│   │   ├── cal.js              ← Cal SDK agent (tools: getAvailableSlots, createAppointment, ...)
│   │   ├── max.js              ← Max SDK agent (tools: triggerSequence, sendEmail, sendWhatsApp)
│   │   ├── rex.js              ← Rex SDK agent (tools: searchLeads, getLeads, exportCsv)
│   │   ├── nora.js             ← Nora SDK agent (tools: generateEmailTemplates, generateProposal, ...)
│   │   ├── sara.js             ← Sara SDK agent (tools: searchContacts, triggerWebhook)
│   │   └── veronica.js         ← Veronica SDK agent (tools: learnGhl, diagnoseWorkflow, ...)
│   ├── agents.js               ← Agent definitions (id, name, role, intro)
│   ├── orchestrator.js         ← Luna: keyword routing logic
│   ├── agent-handlers.js       ← All agent handlers (runAgent function)
│   ├── mcp-tools.js            ← Extracted MCP tool handlers (testable)
│   ├── supabase.js             ← Supabase client + helpers
│   ├── self-learning.js        ← System prompt override + interaction logging
│   ├── compress-history.js     ← Chat history compression
│   ├── veronica-agent.js       ← Veronica: workflow debug + NotebookLM
│   ├── iris-agent.js           ← Iris: lead intake + pipeline creation
│   ├── dash-agent.js           ← Dash: pipeline Kanban management
│   ├── survey-agent.js         ← Ayla: Playwright survey auto-fill
│   ├── rex-agent.js            ← Rex: Google Maps lead scraping
│   ├── nora-agent.js           ← Nora: content generation
│   ├── max-agent.js            ← Max: email/WhatsApp outreach
│   ├── cal-agent.js            ← Cal: Google Calendar
│   └── nora-agent.js
├── index.js                    ← MCP Server (stdio transport)
├── workflow-agent.js           ← Echo: GHL workflow export (Playwright)
├── ghl-webhook-trigger.js      ← Sara: webhook trigger
├── ghl-assistant.js            ← NotebookLM query helper (used by Veronica)
├── data/
│   └── supabase-schema.sql     ← Run in Supabase SQL Editor to create tables
├── workflows/                  ← Exported GHL workflow JSONs
│   ├── agency/                 ← Agency pipeline workflows
│   └── dental client/          ← Dental patient journey workflows (19 WFs)
├── tests/                      ← Vitest test files
└── vitest.config.js
```

---

## All Agents

### Agency Level (12 agents)

| Agent | ID | Role | File |
|---|---|---|---|
| Luna | `orchestrator` | Routes all requests to right agent | `lib/orchestrator.js` |
| Veronica | `veronica` | Platform brain: GHL knowledge + workflow debug + learning | `lib/veronica-agent.js` |
| Echo | `workflow-export` | Exports GHL workflow JSONs via Playwright | `workflow-agent.js` |
| Ayla | `survey-tester` | Auto-fills and submits survey forms via Playwright | `lib/survey-agent.js` |
| Sara | `workflow-tester` | Triggers webhooks for workflow testing | `ghl-webhook-trigger.js` |
| Rex | `rex` | Scrapes Google Maps for dental business leads | `lib/rex-agent.js` |
| Nora | `nora` | Creates content + social media posts via Canva + GPT | `lib/nora-agent.js` |
| Max | `max` | Email + WhatsApp follow-up sequences | `lib/max-agent.js` |
| Cal | `cal` | Google Calendar: slots, bookings, reschedules | `lib/cal-agent.js` |
| Iris | `iris` | Lead intake: survey/booking → pipeline | `lib/iris-agent.js` |
| Dash | `dash` | Pipeline Kanban manager | `lib/dash-agent.js` |
| Atlas | `atlas` | Onboarding: dental biz full setup | *(future)* |

### Per Dental Business (future phase)

| Agent | Role |
|---|---|
| Zara | WhatsApp patient agent (text + voice) |
| Cal-D | Google Calendar for dental bookings |
| Max-D | Patient appointment reminders |
| Nora-D | Dental social media content |
| Dash-D | Patient analytics dashboard |
| Weba | Website builder + form generator |

---

## Agent Personas & Luna Handoff Guide

This section gives Luna (and any future orchestrator) the full context on each agent — persona, responsibilities, capabilities, handoff triggers, and boundaries. Luna uses this to route and delegate correctly.

---

### 🌙 Luna — Mission Control Orchestrator
**ID:** `orchestrator` | **File:** `lib/orchestrator.js`

**Persona:** Luna is the calm, confident coordinator. She never does work herself — she listens, understands the intent, and immediately routes to the right specialist. She speaks clearly and tells the user exactly who is handling their request.

**Responsibilities:**
- Parse user intent via keyword matching (not LLM — for speed)
- Route to the correct agent ID
- Surface which agent responded (shown in chat UI as `handledBy`)
- Never attempt to perform a task herself

**Routing keywords:** defined in `lib/orchestrator.js` — each agent has a keyword set. Luna matches the first agent whose keywords appear in the user message.

**Handoff triggers:**
- Any mention of leads/pipeline/stage → Dash or Iris
- Scraping/Google Maps/find clinics → Rex
- Email/WhatsApp/outreach/campaign → Max
- Calendar/slot/booking/appointment → Cal
- Content/post/proposal/email template → Nora
- Workflow/GHL question/debug → Veronica
- Export workflow JSON → Echo
- Webhook trigger/CRM action → Sara
- Survey fill/form test → Ayla

**Does NOT:** answer questions herself, move leads, send emails, book meetings.

---

### 🌸 Iris — Lead Intake Gateway
**ID:** `iris` | **File:** `lib/iris-agent.js` + `lib/agents/iris.js`

**Persona:** Iris is gentle, thorough, and precise. She is the first point of contact for every lead entering the system. She validates data carefully and never creates duplicates.

**Responsibilities:**
- Accept lead data from: manual form, website contact form (Option A — future), Rex pipeline button, chat command
- Validate required fields: name + (email or phone)
- Detect duplicates by email/phone — return existing lead instead of creating new
- Create lead in `agency_leads` table at `new_lead` stage (or `meeting_scheduled` if booking)
- Accept Rex leads via `add-rex-leads` action (business name = clinic_name, relaxed validation)
- Signal Dash that a new lead exists
- Signal Max to start follow-up sequence

**Capabilities (tools):**
- `processIntake` — validate + create lead
- `getRecentLeads` — last N leads
- `getPipelineCounts` — count per stage
- `add-rex-leads` — bulk add from Rex scraper

**Does NOT:** move leads between stages (Dash's job), send emails (Max's job), book meetings (Cal's job).

**Handoff from:** Rex (when user clicks "Add to Pipeline"), website contact form (future), manual form in UI.
**Handoff to:** Dash (lead now exists in pipeline), Max (start outreach sequence).

---

### 📊 Dash — Pipeline Manager
**ID:** `dash` | **File:** `lib/dash-agent.js` + `lib/agents/dash.js`

**Persona:** Dash is organized, data-driven, and fast. He keeps the pipeline accurate and up to date. He has full visibility over every lead's journey and history.

**Responsibilities:**
- Display Kanban board (8 stages, all leads grouped by stage)
- Move leads between ANY stage (no restrictions — user has full control)
- Log every move in `pipeline_history` table
- Search leads by name (partial match, case-insensitive)
- Add notes to leads
- Show pipeline stats (total, won, conversion rate)
- Trigger follow-up signal to Max when stage changes

**Pipeline stages:**
`new_lead` → `meeting_scheduled` → `showed_up` / `no_show` → `interested` / `not_interested` → `long_term_follow_up` → `client_won`

**Capabilities (tools):**
- `search_leads` — find lead by name
- `move_lead_stage` — move to any stage (uses `forceMoveLeadStage` — bypasses VALID_TRANSITIONS)
- `get_board_data` — full Kanban data
- `get_lead_detail` — single lead + full history
- `add_lead_note` — add note without stage change
- `get_pipeline_stats` — conversion metrics

**UI actions (pre-SDK):** `get-board`, `move-stage`, `get-lead-detail`, `add-note`, `get-stats`

**Does NOT:** create leads (Iris), send emails (Max), book meetings (Cal).

**Handoff from:** Iris (new lead created), Rex (lead added to pipeline), Cal (meeting booked → stage update), chat command.
**Handoff to:** Max (stage change triggers follow-up sequence).

---

### 🔍 Rex — Lead Scout
**ID:** `rex` | **File:** `lib/rex-agent.js` + `lib/agents/rex.js`

**Persona:** Rex is resourceful, thorough, and results-oriented. He finds dental business prospects that nobody else can find — straight from Google Maps. He enriches every lead with as much contact info as possible.

**Responsibilities:**
- Scrape Google Maps for dental clinic leads using Apify (primary) or Google Places API (fallback)
- Pass city as separate `locationQuery` to Apify for geographic accuracy
- Post-filter results by city to remove off-target results
- Enrich leads: visit each website and extract email via regex
- Deduplicate against existing `rex_leads` in Supabase
- Save new leads to `rex_leads` table via upsert
- Add selected leads directly to `agency_leads` pipeline via `add_to_pipeline` tool
- Export leads as CSV

**Capabilities (tools):**
- `search_leads` — scrape Google Maps
- `get_leads` — load from Supabase with filters
- `add_to_pipeline` — move a named lead from `rex_leads` → `agency_leads` (new_lead stage)
- `export_leads_csv` — CSV export
- `clear_leads` — wipe `rex_leads` table
- `get_status` — check which API keys are connected

**Data stored in:** `rex_leads` table (separate from agency pipeline)

**Does NOT:** send emails, move pipeline leads, book meetings.

**Handoff from:** user chat command or Rex UI panel search.
**Handoff to:** Iris (via "Add to Pipeline" button or `add_to_pipeline` tool), Max (via "Send to Max" button).

---

### 📧 Max — Outreach Agent
**ID:** `max` | **File:** `lib/max-agent.js` + `lib/agents/max.js`

**Persona:** Max is persistent, persuasive, and strategic. He knows exactly when and how to reach out to a lead — and he never spams. He sequences communications based on pipeline stage.

**Email Platform:** Brevo SMTP (free 300 emails/day, unlimited contacts). Already configured via SMTP_HOST, SMTP_USER, SMTP_PASS in .env. No Mailchimp.

**Responsibilities:**
- Send emails via Brevo SMTP to pipeline leads
- Send WhatsApp messages via Twilio
- Trigger timed follow-up sequences when pipeline stages change
- Insert interest form links in new_lead emails (form hosted at `/intake/[token]`)
- Insert Cal booking links in interested-stage emails
- Track all sent emails in `outreach_schedule` Supabase table
- Auto-move leads between stages based on form fills and time elapsed

**Does NOT:** create leads (Iris), move stages manually (Dash), book meetings (Cal), generate content (Nora).

**Handoff from:** Dash (stage change triggers sequence), Rex ("Send to Max" button), Iris (new lead created → new_lead_sequence).
**Handoff to:** Cal (booking link in emails), Dash (auto stage moves after inactivity/form fill).

---

#### Max Email Workflow (Full Diagram)

```
NEW LEAD enters pipeline (new_lead stage)
│
├─ Immediately → Welcome email [contains Interest Form link]
│
├─ Form submitted? ──YES──► move to INTERESTED stage ──► Interested sequence
│
└─ Form NOT submitted:
   ├─ +1 hour   → Follow-up email 1
   ├─ +3 days   → Follow-up email 2
   ├─ +15 days  → Follow-up email 3
   └─ 15 days elapsed, still no form → move to NOT_INTERESTED


INTERESTED stage
│
├─ Immediately → Email with Cal booking link
│
├─ Meeting booked? ──YES──► move to MEETING_SCHEDULED ──► Pre-meeting reminders
│
└─ Meeting NOT booked:
   ├─ +1 day    → Reminder email
   ├─ +3 days   → Reminder email
   ├─ +7 days   → Reminder email
   ├─ +15 days  → Final reminder
   └─ 15 days elapsed, still no booking → move to LONG_TERM_NURTURE


MEETING_SCHEDULED stage (pre-meeting reminders)
│
├─ 3 days before meeting  → Reminder email
├─ 24 hours before        → Reminder email
└─ 1 hour before          → Reminder email


NO_SHOW stage (lead missed meeting)
│
├─ +1 hour   → Reschedule email 1
├─ +24 hours → Reschedule email 2
├─ +3 days   → Reschedule email 3
├─ +15 days  → Reschedule email 4
└─ 15 days elapsed, still no reschedule → move to LONG_TERM_NURTURE


NOT_INTERESTED stage
│
├─ +24 hours → Re-engagement email [contains Interest Form link]
├─ +3 days   → Re-engagement email 2
├─ +7 days   → Re-engagement email 3
├─ +15 days  → Re-engagement email 4
└─ 15 days elapsed, form still not filled → move to LONG_TERM_NURTURE


LONG_TERM_NURTURE stage
└─ Every 30 days → Nurture email (tips, value, soft CTA)


SHOWED_UP stage (lead attended meeting)
└─ Immediately → Thank-you + proposal email


CLIENT_WON stage
└─ Immediately → Onboarding notification email to Donia (OWNER_EMAIL)
```

#### Max Sequences Reference Table

| Sequence Key | Trigger | Emails | Auto-stage-move |
|---|---|---|---|
| `new_lead_sequence` | Lead enters `new_lead` | Welcome + 3 follow-ups | → `not_interested` after 15d no form |
| `interested_sequence` | Lead enters `interested` | Booking link + 4 reminders | → `long_term_nurture` after 15d no booking |
| `pre_meeting_reminder` | Lead enters `meeting_scheduled` | 3d / 24h / 1h before | — |
| `no_show_reschedule` | Lead enters `no_show` | 1h / 24h / 3d / 15d | → `long_term_nurture` after 15d |
| `not_interested_reengagement` | Lead enters `not_interested` | 24h / 3d / 7d / 15d | → `long_term_nurture` after 15d no form |
| `long_term_nurture` | Lead enters `long_term_nurture` | Monthly indefinitely | — |
| `post_meeting_follow_up` | Lead enters `showed_up` | Thank-you + proposal | — |
| `onboarding_handoff` | Lead enters `client_won` | Notify Donia | → Atlas |

#### Interest Form (in new_lead emails)
- Hosted at: `/intake/[token]` (unique per-lead token, stored in `agency_leads.intake_token`)
- Fields: Name, Clinic name, Treatments interested in (checkboxes), Best time to contact, Any questions
- On submit: Supabase update → stage → `interested` → Max triggers `interested_sequence`
- Token expires: never (so old emails still work)

#### Scheduled Email Storage
All scheduled emails stored in `outreach_schedule` Supabase table:
```
id, lead_id, sequence_key, step_index, send_at (TIMESTAMPTZ), sent_at, status (pending/sent/failed), channel (email/whatsapp)
```
Vercel Cron (every 30 min) picks up rows where `send_at <= NOW()` and `status = pending`, sends them, marks `sent`.

---

### 📅 Cal — Calendar Agent
**ID:** `cal` | **File:** `lib/cal-agent.js` + `lib/agents/cal.js`

**Persona:** Cal is punctual, organized, and proactive. She makes scheduling effortless and ensures nobody misses a meeting. She keeps Iris and Dash updated when bookings happen.

**Responsibilities:**
- Show available time slots (next 14 days, Mon–Fri, 9am–5pm)
- Create Google Calendar appointments
- Handle reschedule requests (cancel old, create new)
- Handle cancellations
- Send email alerts on booking/reschedule/cancel
- Generate booking links for Max email campaigns
- When meeting booked → signal Iris to create/update lead → signal Dash to move to `meeting_scheduled`

**Does NOT:** send outreach emails, move pipeline stages directly, scrape leads.

**Handoff from:** Max (booking link request for email), chat command, future: Iris website form with "book a call" option.
**Handoff to:** Iris (booking creates/updates lead), Dash (stage → meeting_scheduled).

---

### ✍️ Nora — Content Architect
**ID:** `nora` | **File:** `lib/nora-agent.js` + `lib/agents/nora.js`

**Persona:** Nora is creative, strategic, and industry-aware. She understands dental marketing inside out and writes content that converts. Every piece she produces is tailored — never generic.

**Responsibilities:**
- Generate email sequences (intro, follow-up, proposal, drip Day 1/3/7/14)
- Generate custom proposals (personalized to lead name + pain point)
- Generate social media posts (LinkedIn, Facebook, Instagram)
- Generate ad copy (Google Search Ads, Meta Ads)
- Save templates to library for Max to use in campaigns
- Use OpenAI GPT-4o-mini for generation

**Content types:**
- Email sequences → Max uses them for campaigns
- Proposals → sent to specific leads
- Social posts → posted via Meta Graph API
- Ad copy → used in paid campaigns

**Does NOT:** send emails (Max's job), post directly to social (separate Meta integration), scrape leads.

**Handoff from:** user request for content, Max (needs template for campaign).
**Handoff to:** Max (templates saved to library → Max picks them for campaigns).

---

### 🧠 Veronica — Platform Brain
**ID:** `veronica` | **File:** `lib/veronica-agent.js` + `lib/agents/veronica.js`

**Persona:** Veronica is knowledgeable, analytical, and patient. She is the internal expert on GoHighLevel and the DentaFlow platform. She can explain anything and debug any workflow issue.

**Responsibilities:**
- Answer any GHL question using NotebookLM knowledge base + web search
- Debug exported GHL workflow JSONs (dual analysis: NotebookLM + OpenAI)
- Explain what a workflow does step by step
- Browse exported workflow folders by sub-account
- Run parallel analysis: NotebookLM (GHL docs context) + GPT-4o-mini (direct JSON analysis)

**Does NOT:** export workflows (Echo's job), trigger webhooks (Sara's job), move pipeline leads.

**Handoff from:** user GHL question, workflow debug request.
**Handoff to:** Echo (if workflow JSON needs to be exported first).

---

### ⚙️ Echo — Workflow Export Specialist
**ID:** `workflow-export` | **File:** `workflow-agent.js`

**Persona:** Echo is meticulous and technical. She captures exact workflow JSON — including triggers — that the GHL UI doesn't expose easily. She uses Playwright + API interception to get the real data.

**Responsibilities:**
- List all workflows in a GHL sub-account via API
- Export workflow JSON + trigger JSON via Playwright network interception
- Save exports as JSON files in `workflows/{sub-account}/` folder
- API-first approach (no browser if API works), Playwright fallback
- Per-location auth files to avoid re-login

**Does NOT:** analyze workflows (Veronica), trigger webhooks (Sara), move pipeline leads.

**Handoff from:** user wants to export, Veronica needs JSON to debug.
**Handoff to:** Veronica (exported JSON → debug/explain).

---

### 🎯 Sara — CRM Action Specialist
**ID:** `workflow-tester` | **File:** `ghl-webhook-trigger.js` + `lib/agents/sara.js`

**Persona:** Sara is precise and action-oriented. She doesn't guess — she confirms before firing. She triggers real GHL workflows by sending inbound webhook payloads with real contact data.

**Responsibilities:**
- Search GHL contacts by name
- Trigger inbound webhooks for 4 built-in event types: Treatment Booked/Rescheduled, Personal Consultation Booked/Rescheduled
- Support custom event types and payload templates
- Confirm contact + event before sending
- Show trigger history

**Does NOT:** move pipeline leads, send emails, export workflows.

**Handoff from:** user wants to test a GHL workflow with a real contact.
**Handoff to:** Veronica (if workflow didn't fire as expected → debug).

---

### 🧪 Ayla — Survey Auto Tester
**ID:** `survey-tester` | **File:** `lib/survey-agent.js`

**Persona:** Ayla is systematic and thorough. She tests every survey/form exactly as a real user would — filling required fields, respecting conditional logic, and submitting cleanly.

**Responsibilities:**
- Auto-fill and submit GHL surveys/forms using Playwright
- Support multiple survey targets with saved user profiles
- Handle conditional questions defined in config
- Auto-fill optional fields randomly
- Submit and confirm completion

**Does NOT:** create leads (Iris), trigger webhooks (Sara), move pipeline leads.

**Handoff from:** user wants to test a survey or form.

---

### 🏗️ Atlas — Onboarding Architect *(future)*
**ID:** `atlas` | **File:** *(not built yet)*

**Persona:** Atlas is thorough and efficient. He activates at the moment of "Client Won" and sets up everything a new dental business needs on the platform — fully automated.

**Responsibilities (planned):**
- Triggered when Dash moves a lead to `client_won`
- Set up full dental client stack: Google Calendar, WhatsApp, Supabase tables, website
- Send welcome email with credentials
- Hand off to per-dental-business agents (Zara, Cal-D, Max-D, Nora-D)

**Does NOT:** handle agency pipeline (Dash/Iris), scrape leads (Rex).

**Handoff from:** Dash (client_won stage trigger via Max's `onboarding_handoff` follow-up).

---

## Agent Collaboration Map

```
Website Form / Manual Entry / Rex
        ↓
      IRIS (lead intake → new_lead)
        ↓
      DASH (pipeline board — track + move stages)
        ↓
   stage change
    ↙      ↘
  MAX      CAL
(outreach) (meetings)
    ↓         ↓
  NORA     IRIS (meeting booked → meeting_scheduled)
(templates)
              ↓ client_won
           ATLAS (onboarding)

REX → scrapes leads → IRIS (add to pipeline) or MAX (email campaign)
VERONICA ↔ ECHO (debug needs JSON, JSON needs explanation)
SARA — standalone webhook testing
AYLA — standalone form testing
LUNA — routes everything above
```

---

## Pipeline Stages (Iris + Dash)

```
new_lead → meeting_scheduled → showed_up  → interested       → client_won
                             → no_show    → not_interested
                                          → long_term_follow_up
```

Valid transitions are enforced in `dash-agent.js` (VALID_TRANSITIONS map).

---

## Supabase Tables

### `agency_leads`
Main pipeline table. Created/updated by Iris. Read/moved by Dash.

### `pipeline_history`
Every stage move and note. Used for lead detail view and audit trail.

### `chat_messages`
Per-agent chat history. Loaded on mount, saved after each message.

### `rex_leads`
Dental business leads scraped by Rex.

**Setup:** Run `data/supabase-schema.sql` in Supabase SQL Editor.

---

## Environment Variables

```env
# GHL (for Echo, Sara, Ayla)
GHL_API_KEY=
GHL_LOCATION_ID=
GHL_BASE_URL=https://services.leadconnectorhq.com
GHL_API_VERSION=2021-07-28

# Webhooks (Sara)
GHL_WEBHOOK_TREATMENT_BOOKED=
GHL_WEBHOOK_TREATMENT_RESCHEDULED=
GHL_WEBHOOK_PC_BOOKED=PENDING
GHL_WEBHOOK_PC_RESCHEDULED=PENDING

# Supabase (Iris, Dash, Rex, chat history)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=        ← MISSING — add this

# Google Calendar (Cal)
GOOGLE_CALENDAR_CLIENT_ID=            ← MISSING
GOOGLE_CALENDAR_ID=                   ← MISSING

# Email (Max)
SMTP_HOST=
SMTP_USER=
SMTP_PASS=

# Social / Meta Graph API (Nora)
META_PAGE_ACCESS_TOKEN=               ← Facebook Page token (from Meta Business Suite)
META_PAGE_ID=                         ← Facebook Page ID (numeric)

# Canva Connect API (Nora)
CANVA_CLIENT_ID=                      ← from https://www.canva.com/developers/
CANVA_ACCESS_TOKEN=                   ← OAuth access token (user-level)

# AI
OPENAI_API_KEY=

# Mailchimp (Max legacy)
MAILCHIMP_SERVER_PREFIX=us10
MAILCHIMP_LIST_ID=
```

---

## How Routing Works

`app/api/chat/route.js` → `lib/orchestrator.js` (resolveAgent) → `lib/agent-handlers.js` (runAgent)

Luna uses **keyword matching** (not LLM) for speed. Keywords defined in `orchestrator.js`.

---

## Testing

```bash
npm test              # run all tests once
npm run test:watch    # watch mode
npm run test:coverage # with coverage report
```

Test files: `tests/`
- `orchestrator.test.js` — routing logic (56 tests)
- `export-workflows.test.js` — workflow export functions (25 tests)
- `ghl-webhook-trigger.test.js` — webhook trigger (21 tests)
- `mcp-tools.test.js` — MCP tool handlers (28 tests)
- `iris-agent.test.js` — lead intake (added in agent build phase)
- `dash-agent.test.js` — pipeline manager (added in agent build phase)

**Rule:** Any code change → run `npm test` before committing. All tests must pass.

**Reusable Intelligence Rule:** If a task is done more than once (e.g., adding a new agent, writing tests for an agent, building a follow-up sequence), extract it into a reusable pattern in `docs/patterns/`. Claude should auto-create a skill or pattern doc rather than re-solving the same problem.

---

## Running Locally

```bash
# Frontend (Next.js)
npm run dev          # http://localhost:3000

# MCP Server (for Claude Desktop)
node index.js
```

---

## Deployment

| Service | Platform | Notes |
|---|---|---|
| Frontend | Vercel | Auto-deploy from GitHub |
| Backend agents | Render | Free tier: sleeps after 15min inactivity |
| Database | Supabase | Free tier: 500MB |

---

## Key Patterns

### Agent handler pattern
Every agent in `agent-handlers.js` follows:
```js
if (agentId === "agent-name") {
  if (context.action === "specific-action") { ... }
  // Default: return status/intro
}
```

### Extractable logic
Pure business logic goes in `lib/[agent]-agent.js` (exported functions).
Handler wiring goes in `lib/agent-handlers.js`.
This keeps logic testable without spinning up the full server.

### Supabase fallback
Every Supabase call checks `if (!sb) return fallback`.
This allows tests and dev to run without a live Supabase connection.

### Stage validation
`dash-agent.js` enforces valid pipeline transitions.
Invalid moves throw errors — never silently succeed.

---

## Learnings & Gotchas

### 1. "book" keyword too broad in orchestrator
`"book"` matches inside `"facebook"` (f-a-c-e-**book**) and `"notebook"`.
Fix: use specific phrases like `"book appointment"`, `"book meeting"`.

### 2. Nova merged into Veronica
Nova (ghl-assistant) is gone. All routes that went to `ghl-assistant` now go to `veronica`.
In `agent-handlers.js` there is a redirect: `if (agentId === "ghl-assistant") agentId = "veronica"`.
Keep this for backward compatibility.

### 3. vitest mock for OpenAI must be a class
`vi.mock("openai", () => ({ default: vi.fn() }))` fails because `new OpenAI()` needs a constructor.
Use: `vi.mock("openai", () => ({ default: class OpenAI { constructor() {} } }))`.

### 4. ES Module project — vitest config must not use ts
Use `vitest.config.js` not `.ts`. No `@vitejs/plugin-react` needed for node-only tests.

### 5. Supabase anon key missing
`NEXT_PUBLIC_SUPABASE_ANON_KEY` is not in `.env`. Without it, Supabase client returns null.
All agents gracefully fallback but data is not persisted. Add the key from Supabase dashboard.

### 6. Iris duplicate detection
If same email/phone submits survey again → Iris returns existing lead, does NOT create duplicate.
If same lead books a calendar meeting → stage upgrades to `meeting_scheduled`.

### 7. Dash stage transitions are strict
Not every stage → every other stage. VALID_TRANSITIONS map enforces business logic.
`client_won` is terminal — no moves out.

### 8. "board" keyword matches "onboarding"
`"board"` appears inside `"onboarding"` causing nora requests to route to dash.
Fix: removed `"board"` from dash keywords. Use `"kanban"`, `"pipeline"`, `"move stage"` instead.

### 9. "onboard" keyword too broad
`"onboard"` appears inside `"onboarding"` — a word used in email/content requests.
Fix: atlas now uses `"onboard client"`, `"setup client"`, `"new dental client"` instead.

### 11. vi.mock() with fs/promises default import needs vi.hoisted()
`cal-agent.js` uses `import fs from "fs/promises"` (default import). A plain `vi.mock()` with named exports won't control the default. Use `vi.hoisted()` to create shared mock functions first:
```js
const { mockReadFile, mockWriteFile } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("fs/promises", () => ({
  default: { readFile: mockReadFile, writeFile: mockWriteFile },
  readFile: mockReadFile,
  writeFile: mockWriteFile,
}));
```
Then reference `mockReadFile` / `mockWriteFile` directly in tests.

### 10. getPipelineStats dev fallback must include wonCount
When Supabase is null, the fallback object must include `wonCount: 0` (not just `totalLeads`/`conversionRate`).
Tests rely on `stats.wonCount` existing in all code paths.

### 12. OpenAI Agents SDK requires zod@^4 and --legacy-peer-deps
`@openai/agents` v0.11.x requires `zod@^4.0.0`. The project shipped with zod v3.
Install order:
```bash
npm install @openai/agents --legacy-peer-deps
npm install zod@^4.0.0 --legacy-peer-deps
```
Verify with: `node -e "import('@openai/agents').then(m => console.log(Object.keys(m)))"`.

### 13. lib/agents/ pattern for SDK agent definitions
All SDK agents live in `lib/agents/[agent-name].js`. Each file:
1. Imports pure functions from `lib/[agent]-agent.js`
2. Wraps each function as a `tool({ name, description, parameters: z.object({...}), execute })` 
3. Exports a single `Agent` instance with name, instructions, and tools array

This keeps pure logic testable separately from the SDK wrapper.

### 14. nora-agent.js uses OPENAI_API_KEY (not ANTHROPIC_API_KEY)
Originally written with Anthropic SDK. Switched to `openai` package + `gpt-4o-mini` to be consistent with the project. If you see "ANTHROPIC_API_KEY missing" error, check if you're on an older version.

### 15. SDK routing in agent-handlers.js
SDK agents (Iris, Dash, Cal, Max, Rex, Nora, Sara, Veronica) are routed via the `SDK_AGENTS` map before the explicit `if (agentId === ...)` blocks. Echo and Ayla are intentionally NOT in `SDK_AGENTS` — they run Playwright and must stay on their own handlers.

### 16. Echo (workflow export) — Playwright login detection broken by domain name
GHL uses `login.bucktoothmarketing.com` as the domain for ALL pages (login AND dashboard AND workflow pages). Any check like `url.includes("login")` always returns `true` — even after successful login.
Fix: check `pathname === "/"` instead.

### 17. Echo — `waitForURL` fires during OTP page — browser closes prematurely
`waitForURL` with `pathname !== "/"` resolves when GHL navigates to its OTP/2FA page (e.g., `/two-factor`). The session gets saved with incomplete auth, export runs immediately, gets null JSON, browser closes — all in ~18 seconds.
Fix: explicitly exclude known GHL auth intermediate paths:
```js
await page.waitForURL(
  (url) => {
    const path = url.pathname;
    if (!path || path === "/" || path === "") return false;
    if (url.search.includes("logout")) return false;
    // Block known GHL auth intermediate pages
    const authPages = ["/two-factor", "/mfa", "/otp", "/verify", "/confirm", "/forgot", "/reset", "/security", "/auth/"];
    if (authPages.some((p) => path.startsWith(p))) return false;
    return true;
  },
  { timeout: 300000 } // 5 minutes — enough for email + password + OTP
);
```
This passes for `/ai-employee-promo` and `/location/...` but not for `/two-factor` etc.

### 18. Echo — workflow_json: null because page.on("response") misses GHL's API calls
GHL may use bundled/polyfilled fetch that bypasses CDP-level `page.on("response")`, or load from an endpoint not in the Firebase/GHL API domain filter. Two-pronged fix:
1. **Broaden the response handler** — remove URL domain filter, check content-type + body structure on ALL JSON responses. Log all JSON URLs for debugging.
2. **Patch window.fetch via addInitScript** — runs BEFORE GHL's React bundle loads, intercepts every `fetch()` call at the JS level:
```js
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
            if (json.workflowData || json._id || json.templateData || json.templates) {
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
```
After navigation, read captures: `await page.evaluate(() => window.__ghl_captures)`.
`addInitScript` runs BEFORE every page load/reload, so `__ghl_captures` resets automatically per workflow.

### 19. Echo — shared browser for batch export
`exportSelectedWorkflows` opens ONE browser for all selected workflows. Login happens once, then the shared `page` is passed to each `exportWorkflowWithPage()` call. Legacy `exportWorkflow()` (used by CLI `main()`) still opens its own browser.
After login completes, add `await page.waitForLoadState("networkidle")` before the export loop — GHL SPA does post-login redirects that need to settle.

### 21. Echo — GHL workflow + trigger JSON exact structure (confirmed via DevTools)
Found by inspecting Network tab in browser with workflow ID as filter.

**Workflow JSON** comes from `services.leadconnectorhq.com` REST API (NOT Firebase Storage).
Response body structure:
```json
{ "_id": "886a0fd9-...", "name": "...", "workflowData": { "templates": [...] }, "fileUrl": "https://firebasestorage...", "triggersFilePath": "location/.../workflow-triggers/.../4", ... }
```
Body check must be `json.workflowData` ONLY — NOT `json._id` alone (see learning #22).

**Trigger JSON** comes from a URL containing `trigger?workflowId=<id>` (also GHL REST API).
Response is an **array** (not object):
```json
[{ "id": "...", "type": "opportunity_created", "conditions": [...], "workflow_id": "886a0fd9-..." }]
```
Our URL check `url.toLowerCase().includes("trigger")` correctly matches this.

**Root cause of previous null exports**: the response handler was filtering by `firebasestorage.googleapis.com` OR `services.leadconnectorhq.com && wf.id`. The workflow endpoint on `services.leadconnectorhq.com` does NOT always have the UUID in the URL path — it may be in the response body only. Fix: remove all URL domain filters, check body structure only.

### 22. Echo — `json._id` alone is not a safe workflow check — causes garbage capture
GHL returns many responses with `_id` that are NOT workflow data (e.g. account/company onboarding object with `gamification`, `skipPages`, `ownerImpDismissals`). These accidentally match a broad `json._id` check and get saved as `workflow_json`, resulting in completely wrong data.

**Root cause**: `GET /workflows/{id}?locationId={id}` (single-workflow detail) does NOT exist in the GHL public API — it returns a 200 with the wrong JSON object (company data), not the workflow.

**Fix applied in three places:**
1. `fetchWorkflowViaApi` — requires `workflowJson.workflowData` (must exist) AND `workflowJson._id === wf.id` (must match). If not, throws → Playwright fallback.
2. CDP response handler — removed `json._id` from condition, only `json.workflowData || json.templateData || json.templates`.
3. `addInitScript` fetch interceptor — same: removed `json._id`, requires `json.workflowData`.

**Correct workflow_json** must have `workflowData.templates` array with actual automation steps, NOT company account fields.

### 20. cal-agent test: daysAhead: 1 fails on weekends
`getAvailableSlots({ daysAhead: 1 })` returns 0 slots on Saturday/Sunday because the next day is also a weekend.
Fix: use `daysAhead: 7` in tests to always cover weekdays regardless of run date.

### 23. Echo — API-first approach for workflow export (no browser needed)
`fetchWorkflowViaApi(wf, locationId, token)` tries GHL REST API before launching Playwright.
- Uses PIT (Personal Integration Token) directly with `services.leadconnectorhq.com`
- Fetches trigger via Firebase Storage URL embedded in `workflowJson.fileUrl` + `triggersFilePath`
- If API returns wrong data (no `workflowData`) → throws → `exportSelectedWorkflows` falls back to Playwright
- `exportSelectedWorkflows` Phase 1 loops all workflows via API, collects failures in `needsPlaywright[]`, Phase 2 opens browser only if needed
- This means login is never required if PIT token has correct permissions

**Firebase trigger URL construction:**
```js
const baseMatch = fileUrl.match(/^(https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/)/);
const tokenMatch = fileUrl.match(/[?&]token=([^&]+)/);
const triggerUrl = `${baseMatch[1]}${encodeURIComponent(triggersFilePath)}?alt=media&token=${tokenMatch[1]}`;
```

### 24. Echo — per-location auth file prevents cross-account contamination
Auth is saved as `auth-{locationId}.json` instead of a single `auth.json`.
Different GHL sub-accounts (different `locationId`) get separate session files.
Same `locationId` reuses saved session — user only logs in once per account.
```js
const authFile = (locationId) => `auth-${locationId}.json`;
```

### 25. Echo — `waitForURL` whitelist pattern for OTP detection
GHL uses `login.bucktoothmarketing.com` domain for ALL pages including OTP/2FA.
Blacklisting known OTP paths (`/two-factor`, `/mfa`, etc.) is fragile — GHL's actual path may differ.
**Fix: whitelist known post-login URLs** instead of blocking bad ones:
```js
await page.waitForURL(
  (url) => {
    const p = url.pathname;
    return p === "/ai-employee-promo" || p.startsWith("/location/") || p.startsWith("/agency");
  },
  { timeout: 300000 }
);
```
This waits until the user completes OTP and GHL lands on a real dashboard page.

### 26. Vitest: `await import()` inside describe() block causes parse error
`await import("playwright")` at the top of a `describe()` callback is invalid — top-level await is only allowed at module level, not inside callbacks.

**Wrong:**
```js
describe("my tests", () => {
  const { chromium } = await import("playwright"); // ← SyntaxError
```

**Fix:** Use a top-level import at the top of the file. `vi.mock("playwright")` intercepts it automatically:
```js
import { chromium } from "playwright"; // at top of file — vi.mock intercepts this
// ...
vi.mock("playwright", () => ({ chromium: { launch: vi.fn()... } }));
// chromium is now the mock in all describe blocks
```

### 27. Echo — sub-account folder name must be lowercased to prevent duplicates
`sanitizeSubAccountName` without `.toLowerCase()` creates separate folders for same account with different capitalization:
- `"Bucktooth Marketing"` → `workflows/Bucktooth Marketing/`
- `"bucktooth marketing"` → `workflows/bucktooth marketing/` ← duplicate folder, JSONs split across both

**Fix:** Always lowercase in `sanitizeSubAccountName`:
```js
function sanitizeSubAccountName(subAccountName = "") {
  return subAccountName.toLowerCase().replace(/[<>:"/\\|?*]+/g, "_").trim() || "unknown-sub-account";
}
```
Tests that create folders manually must also use lowercase paths to match — e.g. `path.join(tmpDir, "workflows", "testclient")` not `"TestClient"`.

### 28. Echo UI layout — panel above chat, not below
When Echo agent is active, the workflow panel (inputs, buttons, list) should appear ABOVE the chat messages, not below. Chat messages are secondary (just showing export status); the workflow controls are primary.

**Fix:** 
1. Render `<div className="echo-panel">` BEFORE `<div className="messages">` in JSX
2. Add `.chat-echo-mode` CSS class when `selectedAgent === "workflow-export"` — sets `grid-template-rows: auto auto 1fr auto`
3. Echo panel gets `max-height: 55vh; overflow-y: auto` so it scrolls internally
4. Messages in echo mode get `max-height: 200px` — just enough to show last response

### 29. Echo — 2-column resizable layout via CSS grid + inline style
Echo mode uses a 3-column CSS grid: `{leftPct}% 16px 1fr` (left panel | resize handle | chat).
The middle column is a drag handle div. `gridTemplateColumns` is set via inline React state so it updates live on drag.
`grid-template-areas` in CSS defines named zones: `header`, `panel`, `resize`, `chat`, `form`.
Drag logic: `onMouseDown` → document `mousemove` listener → `setEchoPanelWidth(pct)` → `onMouseUp` cleans up.
Clamp width between 25% and 75% to prevent panels from becoming unusable.

### 30. Echo — "Load Exported JSON" button dual behavior
Button behavior depends on what's selected:
- **Workflows selected in GHL list** → shows JSON content of those specific workflows in chat (calls `load-json-content` action per workflow, derives filename from `wf.name.replace(/[<>:"/\\|?*]+/g, "_") + ".json"`)
- **Nothing selected** → lists all exported JSON files in the sub-account folder (browse mode, switches to Exported JSONs tab)
If a JSON file doesn't exist for a selected workflow: shows "❌ JSON not available for [name] — export it first."

### 31. Echo — "Delete Selected JSON" button dual behavior  
- **Workflows selected in GHL list** → derives filenames from selected workflow names, confirms with themed dialog, deletes
- **Files checked in Exported JSONs tab** → deletes those checked files
- **Nothing at all** → error message "Select workflows from the list (or check files below) to delete their JSON."
Always shows themed confirm dialog listing exact files before deletion.

### 32. Echo — auto-select all JSON files on load was a destructive default
Original code: `setSelectedExportedFiles(files.map(f => f.fileName))` auto-checked ALL files when loading.
Result: user clicking "Delete Selected JSON" immediately wiped everything.
Fix: `setSelectedExportedFiles([])` — start with nothing selected, user explicitly checks what to delete.

### 33. Echo — fuzzy folder matching for listExportedWorkflowFiles
If exact sanitized folder not found, `listExportedWorkflowFiles` scans all folders in `workflows/` and finds closest match:
1. Exact lowercase+trim match
2. Substring match (one contains the other)
This prevents "0 files found" when user types slightly different name than original export.
Also exposes `listAvailableSubAccounts()` which returns all folder names — UI shows a dropdown instead of text input once folders exist.

### 34. Echo — tabbed list UI (GHL Workflows vs Exported JSONs)
Two tabs in the Echo panel list area:
- **GHL Workflows** — full list from GHL with search + checkboxes (auto-selected on "Load Workflows")
- **Exported JSONs** — only saved JSON files, with View button per row (auto-selected on "Load Exported JSON")
Tab badge shows count. Auto-switch: Load Workflows → workflows tab; Load Exported JSON → exported tab.
Tabs share the same action buttons (Export Selected, Load Exported JSON, Delete Selected JSON).

### 35. Echo — window.confirm replaced with themed custom dialog
`window.confirm()` shows native browser dialog with wrong styling. Replaced with React state-driven modal:
- `confirmDialog` state holds `{ message, onConfirm }` where `onConfirm` is a resolver function
- `showConfirm(message)` returns a `Promise<boolean>` — await it like `window.confirm`
- Modal uses project color scheme: dark blue background, red Delete button, cancel in muted blue
- Click outside OR ✕ button → resolves false (cancel)

### 36. Sidebar collapsible — CSS :has() selector
`.app-shell:has(.sidebar-collapsed)` changes grid from `280px 1fr` to `52px 1fr`.
No state needs to be lifted to page.js — CSS reacts to the class on the child element automatically.
Sidebar renders only the toggle button when collapsed; agent list is hidden via conditional render.

### 37. Agent avatar lightbox — WhatsApp style popup
Click on agent avatar → shows a small centered card (NOT full-screen overlay):
- `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%)` centers the popup
- Invisible full-screen div behind it captures clicks for dismiss (z-index: 2000), popup at z-index: 2001
- `e.stopPropagation()` on avatar click prevents bubbling to the agent-btn (which would switch agent)
- Animation: `popup-in` keyframe scales from 0.88 to 1.0 for WhatsApp-like feel

### 38. Veronica pre-SDK handler block — explicit actions must bypass SDK routing

All agents in `SDK_AGENTS` map (including Veronica) get routed through OpenAI SDK BEFORE reaching any explicit `if (agentId === "veronica")` block. This means UI panel actions (`browse-sub-accounts`, `list-workflows-in-folder`, `explain-workflow`, `debug-workflow`) would never reach the handler.

**Fix:** Add a pre-SDK Veronica block BEFORE the `const SDK_AGENTS = {...}` line in `runAgent()`:
```js
if (agentId === "veronica") {
  if (context.action === "browse-sub-accounts") { ... return; }
  if (context.action === "list-workflows-in-folder") { ... return; }
  if (context.action === "explain-workflow" || context.action === "debug-workflow") { ... return; }
  // intent detection for structured chat flow
  // if none match → fall through to SDK routing below
}
```
This pattern: **check explicit action/intent → return early OR fall through to SDK** keeps LLM chat working for general GHL Q&A while giving structured control to UI flows.

### 39. Veronica structured chat flow — inline data cards in message bubbles

Veronica's debug/explain flow uses server-returned `data` objects that render as interactive buttons inside message bubbles. Message objects now carry `cardData: data.data || null`. Three card types:

- `veronica_clarify` → `{ options: [...] }` — renders clickable option buttons
- `veronica_sub_accounts` → `{ subAccounts: [...], mode }` — renders folder buttons; click sends `list-workflows-in-folder` action
- `veronica_workflow_list` → `{ workflows: [...], folderName, mode }` — renders workflow buttons; click sends `explain-workflow` or `debug-workflow` action

Intent detection uses regex matching before SDK:
- `"want to debug a workflow"` → clarify Q (veronica_clarify)
- `"want to debug a specific workflow"` → sub-accounts (veronica_sub_accounts with mode=debug)
- Same for explain. Falls through to SDK for all other messages (GHL Q&A stays LLM-powered).

### 40. Veronica folder browser panel — auto-loads on agent switch

`useEffect` on `selectedAgent` auto-calls `veronicaLoadSubAccounts()` when Veronica is selected. The panel shows 2-column browser: left=sub-accounts, right=workflows in selected folder. Action area (Explain/Debug buttons + debug issue input) only appears when a workflow is selected. Panel is positioned ABOVE chat messages (rendered before `.messages` div). CSS uses `max-height: 280px` with internal scroll.

### 41. Veronica greeting message — include all capabilities

The greeting (in `getGreetingResponse("veronica")`) must list ALL Veronica capabilities with examples. Previously it only mentioned debugging. Updated to list: debug, explain, full analysis, GHL Q&A, web search, NotebookLM assets. Always include an example prompt like `Try: "I want to debug a workflow"`.

### 42. `msg.text.split()` crashes when text is undefined

In ChatPanel message rendering, `msg.text.split(...)` throws if `msg.text` is undefined (can happen with empty API responses). Always guard: `const parts = (msg.text || "").split(...)`.

### 43. CSS grid children won't scroll without explicit height on parent

`.veronica-folders` and `.veronica-wf-list` have `overflow-y: auto` but are direct children of a CSS grid (`.veronica-browser`). Grid cells default to `align-self: stretch` but don't constrain children's height — they grow to content, so `overflow-y: auto` never activates.

Fix: set an **explicit `height`** on the grid container and add `min-height: 0; height: 100%` on each column:
```css
.veronica-browser {
  height: 190px; /* explicit — forces cells to have a known height */
}
.veronica-folders,
.veronica-wf-list {
  min-height: 0; /* prevents flex/grid child from overflowing */
  height: 100%;  /* fill the grid cell so overflow-y activates */
  overflow-y: auto;
}
```
Without the explicit `height` on the grid, `overflow-y: auto` never fires and the list expands past the panel boundary.

### 44. nlm CLI echoes the full query before results — strip it in explainWorkflowFile / debugWorkflowFile

`nlm cross query --notebooks {ids} "{question}"` outputs the full prompt first:
```
Cross-notebook query: Please explain the following GHL workflow...{full JSON}...
2/2 notebooks responded
╭───╮ notebook 1 response ... ╰───╯
```

`askGhlAssistant` returns this entire output as-is. If you pass the full workflow JSON as the question, the chat response shows the raw JSON dump before the actual answer.

Fix: use `cleanNlmOutput(raw)` in `veronica-agent.js` to strip the echo:
```js
function cleanNlmOutput(raw) {
  const respondedIdx = raw.indexOf(" notebooks responded");
  if (respondedIdx > 0) {
    const lineStart = raw.lastIndexOf("\n", respondedIdx);
    return raw.slice(lineStart + 1).trim();
  }
  return raw.replace(/^Cross-notebook query:[\s\S]*?\n\n/, "").trim();
}
```
Then: `const answer = cleanNlmOutput(await askGhlAssistant(...))`.

### 45. Context7 is NOT useful inside explainWorkflowFile / debugWorkflowFile

Context7 returns generic GHL API reference docs (e.g. "List Workflows endpoint", "Trigger Workflow API"). This is helpful for general GHL Q&A ("how do I use the API to trigger a workflow?") but is noise in explain/debug mode — the user wants analysis of their specific workflow JSON, not API docs.

**Rule:** Only call `queryContext7` from general-purpose Q&A paths (like `diagnoseWorkflowIssue` where a keyword search might surface relevant API context). Never call it from `explainWorkflowFile` or `debugWorkflowFile`.

### 46. Atlas/Echo appearing in NotebookLM explain/debug responses is expected

If NotebookLM responses mention "Atlas" or "Echo" when explaining a workflow, this is normal. The user's notebooks contain DentaFlow documentation that describes all agents including Atlas (Onboarding Architect) and Echo (Workflow Export Specialist). NotebookLM retrieves this as context-relevant content. These are not agents being invoked — they are names from the source documents the notebook was trained on.

### 47. Tavily API is not needed — webSearchTool covers it

`@openai/agents` includes `webSearchTool()` which uses OpenAI's built-in web search. Tavily would be a redundant external API. The project should NOT add a Tavily integration — use `webSearchTool` for all web search needs in Veronica's SDK agent.

### 48. cleanNlmOutput must also strip box-drawing border lines

nlm CLI wraps each notebook's response in Unicode box borders (╭──╮ ╰──╯ │). These render as pipe signs in the chat UI and make the response confusing to read. The filter regex `!/[a-zA-Z0-9...].test(line)` drops pure border lines while keeping content lines. Also strip `│` from the start/end of each content line.

Updated `cleanNlmOutput` pattern:
```js
function cleanNlmOutput(raw) {
  if (!raw) return "";
  const respondedIdx = raw.indexOf(" notebooks responded");
  let text = respondedIdx > 0
    ? raw.slice(respondedIdx).replace(/^\d+\/\d+ notebooks responded\s*\n?/, "").trim()
    : raw.replace(/^Cross-notebook query:[\s\S]*?\n\n/, "").trim();

  const lines = text.split("\n").map(line =>
    line.replace(/^[\s│]+/, "").replace(/[\s│]+$/, "").trimEnd()
  );
  return lines
    .filter(line => /[a-zA-Z0-9؀-ۿ.,!?:;()\-_'"@#%&]/.test(line.trim()))
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
```

### 49. Dual-source explain/debug — NotebookLM + OpenAI in parallel

`explainWorkflowFile` and `debugWorkflowFile` now run two analyses in parallel using `Promise.all`:
1. **NotebookLM** (`askGhlAssistant`) — uses the user's notebooks which contain GHL docs and exported workflow context
2. **OpenAI** (`gpt-4o-mini`) — analyzes the raw workflow JSON directly

Output format:
```
## WorkflowName

### 🧠 NotebookLM
[notebook response — cleaned by cleanNlmOutput]

### 🤖 AI Analysis
[OpenAI direct analysis]
```

If `OPENAI_API_KEY` is missing, the OpenAI section is skipped gracefully.

### 50. OpenAI client must be created lazily in veronica-agent.js

If the OpenAI client is created at module level (`const client = new OpenAI(...)`), the `OPENAI_API_KEY` env var is read at import time — before tests set it. This causes the client to be `null` in all tests even when the key is set in `beforeEach`.

**Fix:** Create the client inside the function call:
```js
async function analyzeWithOpenAI(systemPrompt, userContent) {
  if (!process.env.OPENAI_API_KEY) return null;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  // ...
}
```
This reads `process.env.OPENAI_API_KEY` at call time, which works correctly in both production and tests.

### 51. `.optional()` is banned in ALL SDK agent Zod schemas — use `.nullable()`

The OpenAI Agents SDK (v0.11.x) throws `UserError` at runtime when any tool parameter uses `.optional()`. This crashes the agent even if the parameter is for a DIFFERENT agent (because all SDK agents are imported together via `agent-handlers.js`).

**Rule:** Every `.optional()` in `lib/agents/*.js` must be replaced with `.nullable()`. This applies to ALL agents (cal, iris, dash, max, rex, nora, veronica, sara) — not just the one being worked on.

**Detection:** `node --input-type=module ./lib/agent-handlers.js` — if it prints "OK" the imports are clean; but the actual `UserError` only surfaces at agent run time, not import time.

**Fix applied:** Replaced all `.optional()` → `.nullable()` across all 8 SDK agent wrapper files.

### 52. `callAction()` returns full API response — access `data.data.x` not `data.x`

`callAction(extraContext)` calls `callAgentAPI("__action__", extraContext)` which returns the raw API response:
```json
{ "selectedAgent": "...", "handledBy": "...", "response": "...", "data": { "builtInLabels": [...] } }
```

All Sara handlers that read from `callAction()` results must use `res.data.x`, NOT `res.x`:
```js
// ❌ Wrong
const data = await callAction({ action: "get-init-data" });
setSaraBuiltInLabels(data.builtInLabels);  // undefined

// ✅ Correct
const res = await callAction({ action: "get-init-data" });
setSaraBuiltInLabels(res.data.builtInLabels);  // works
```

This applies to all Sara callAction results: contacts, history, results, events, templates, etc.

### 53. Static UI data must never depend on async API calls

`BUILT_IN_EVENT_LABELS` (Sara's 4 built-in event types) is a static constant — it doesn't change at runtime. It should be defined in the client component, not fetched from the API.

**Wrong approach:** Fetch from `get-init-data` → set state → render dropdown. If API fails (e.g. Supabase down), dropdown is permanently empty.

**Right approach:** Define `SARA_BUILT_IN_LABELS` as a `const` at the top of `ChatPanel.js`. The API call (`get-init-data`) should only fetch truly dynamic data: webhook map (reads .env), custom events (Supabase), templates (Supabase).

### 54. Sara `get-init-data` handler must `.catch(() => [])` on Supabase calls

`get-init-data` calls `getCustomEvents()` and `getPayloadTemplates()` which hit Supabase. If `NEXT_PUBLIC_SUPABASE_ANON_KEY` is missing, `getSupabase()` returns null and these functions return `[]`. BUT if they throw for other reasons (network, schema mismatch), the entire handler throws, route.js returns HTTP 500, and `callAction()` throws in the client — the `.catch(() => {})` in the useEffect silently swallows it, leaving the panel uninitialized.

**Fix:** Always `.catch(() => [])` on Supabase calls inside panel init handlers:
```js
const [customEvents, templates] = await Promise.all([
  getCustomEvents().catch(() => []),
  getPayloadTemplates().catch(() => []),
]);
```

### 55. Chat history not saved when API call fails — save user message in catch

`sendAgentMessage` calls `callAgentAPI` then saves to Supabase. If `callAgentAPI` throws (JSON error, 500, network), `saveChatMessages` is never reached and the message is lost on refresh.

**Fix:** Wrap `callAgentAPI` in try/catch and save the user message even on failure:
```js
let data;
try {
  data = await callAgentAPI(message, extraContext);
} catch (err) {
  saveChatMessages(selectedAgent, [userMsg]).catch(() => {});
  throw err;  // rethrow so onSubmit shows the error
}
```

### 56. Every SDK agent UI panel needs a pre-SDK block for panel actions

Any agent in `SDK_AGENTS` map that has a UI panel (Iris, Dash, Sara, Veronica) MUST have a pre-SDK block BEFORE `const SDK_AGENTS = {...}` in `runAgent()`. Without it, UI panel actions (like `submit-lead`, `get-pipeline-counts`) go to OpenAI SDK which ignores them and returns nothing → `data.success` is undefined → UI shows "Failed."

**Pattern (same for every agent with a panel):**
```js
// BEFORE const SDK_AGENTS = { ... }
if (agentId === "iris") {
  if (context.action === "submit-lead") { ... return; }
  if (context.action === "get-pipeline-counts") { ... return; }
  if (context.action === "get-recent-leads") { ... return; }
  // No match → fall through to SDK for LLM chat
}
```

**Agents with pre-SDK blocks (as of current build):**
- `veronica` — browse-sub-accounts, list-workflows-in-folder, explain-workflow, debug-workflow
- `workflow-tester` (Sara) — search-contacts, get-init-data, fire-webhook, get-sub-accounts, set-webhook-url, etc.
- `iris` — submit-lead, get-pipeline-counts, get-recent-leads

**Rule:** Any time a new panel action is added for an SDK agent, add it to the pre-SDK block first.

### 57. Supabase MCP connector — use it for table creation instead of SQL Editor

Supabase MCP (`mcp__bcfda72f-...__apply_migration` + `execute_sql`) lets Claude create tables directly without the user manually running SQL. Connect via Claude Settings → Connectors → Supabase.

**Usage:**
- `list_projects` → get project ID (use the `ACTIVE_HEALTHY` one)
- `list_tables` → check existing tables before creating
- `apply_migration` → DDL (CREATE TABLE, ALTER TABLE) — use this, not execute_sql for schema changes
- `execute_sql` → queries only (SELECT, INSERT, ALTER ADD COLUMN)

**`CREATE POLICY IF NOT EXISTS` does NOT exist in PostgreSQL 15/17.** Use DROP + CREATE inside a `DO $$ BEGIN ... END $$` block instead.

### 58. agency_leads table — website_url column added post-creation

`agency_leads` was originally created without `website_url`. Added via:
```sql
ALTER TABLE agency_leads ADD COLUMN IF NOT EXISTS website_url TEXT;
```
`normalizeLead()` in `iris-agent.js` does NOT include `website_url` — it's passed directly through the `submit-lead` handler payload to Supabase insert. If normalizeLead is ever updated to include it, make sure the schema has the column.

### 59. Rex uses Apify (not raw Playwright) for Google Maps scraping — keep it

Rex scrapes dental clinics via **Apify's Google Maps Places Scraper actor**, not raw Playwright. This is correct and better:
- Apify handles CAPTCHAs, rate limits, parallel scraping
- Returns structured JSON: name, phone, address, website, rating, reviews, email (from website crawl)
- Has free monthly credits — no cost for typical usage
- Raw Playwright scraping of Google Maps is fragile and slow

Do NOT replace Apify with Playwright for Rex. Keep `APIFY_API_KEY` in `.env`.

### 60. Dash panel layout — board above chat (chat-dash-mode)

When Dash is the active agent, the pipeline board must appear ABOVE the chat messages, not below.

**Implementation:**
1. Add `chat-dash-mode` class to the `<section className="chat">` wrapper when `selectedAgent === "dash"`
2. Move the Dash panel JSX to BEFORE `<div className="messages">` in the render tree
3. CSS for dash mode:
```css
.chat.chat-dash-mode {
  grid-template-rows: auto auto 1fr auto; /* header | board | messages | form */
  overflow: hidden;
}
.chat.chat-dash-mode .dash-panel { max-height: 55vh; overflow-y: auto; }
.chat.chat-dash-mode .messages   { overflow-y: auto; min-height: 80px; }
```

### 61. Drag & drop — use dataTransfer API, not React state (stale closure bug)

React state set inside `onDragStart` is NOT reliably readable inside `onDrop` on a different element. The `onDrop` closure was created at render time when state was still `null`.

**Wrong (stale closure):**
```jsx
onDragStart={() => setDashDragLead({ id: lead.id, stage })}
onDrop={() => { if (dashDragLead) dashMoveLeadStage(dashDragLead.id, ...) }} // dashDragLead is null!
```

**Correct (dataTransfer — survives across elements):**
```jsx
onDragStart={e => e.dataTransfer.setData("application/json", JSON.stringify({ leadId: lead.id, fromStage: stage.key }))}
onDrop={e => {
  const { leadId, fromStage } = JSON.parse(e.dataTransfer.getData("application/json"));
  if (leadId && fromStage !== stage.key) dashMoveLeadStage(leadId, stage.key);
}}
```

### 62. Drag flicker fix — pointer-events: none on column children

`onDragLeave` fires on the column when the cursor moves over a child element (card, header, etc.), causing the drag-over highlight to flash on/off.

**Fix:** Disable pointer events on all column children so drag events only hit the column itself:
```css
.dash-column * { pointer-events: none; }
.dash-card     { pointer-events: all; } /* cards still need to be draggable */
```

### 63. Supabase v2 — `.catch()` not a function on query builder

Supabase JS v2 query builder implements `PromiseLike` (has `.then()`) but NOT the full `Promise` interface (no `.catch()`). Chaining `.catch(() => {})` directly throws `sb.from(...).insert(...).catch is not a function`.

**Wrong:**
```js
await sb.from("pipeline_history").insert([...]).catch(() => {});
```

**Correct:**
```js
try {
  await sb.from("pipeline_history").insert([...]);
} catch (_) {}
```

This applies to ALL Supabase query chains where you want to suppress errors: `.select()`, `.insert()`, `.update()`, `.delete()` — always use `try/catch` with `await`.

### 64. Dash SDK agent — use forceMoveLeadStage + searchLeadsByName

The Dash SDK agent (`lib/agents/dash.js`) originally used `moveLeadStage` which enforces VALID_TRANSITIONS. This was wrong for chat-based moves — the user should be able to move any lead to any stage.

**Fix:**
- Import and use `forceMoveLeadStage` in the `move_lead_stage` tool (bypasses all transition restrictions)
- Add `searchLeadsByName` tool so agent can look up leads by name — never ask user for UUID
- Workflow: user says name → agent calls `search_leads` → gets ID → calls `move_lead_stage`

```js
// In lib/agents/dash.js
const moveLeadStageTool = tool({
  execute: async ({ leadId, toStage, note }) => {
    const result = await forceMoveLeadStage({ leadId, toStage, note: note || "" });
    return JSON.stringify(result);
  },
});
```

### 65. SDK agent conversation continuity — explicit rule prevents re-asking

When an OpenAI SDK agent shows a search result in one turn and the user replies with a follow-up ("move it", "yes", "move her to X"), the agent may forget the context and re-ask "which lead?".

**Fix:** Add an explicit continuity rule in the agent's `instructions`:
```
CONVERSATION CONTINUITY — CRITICAL: If in the previous message you already found and displayed
a lead, and the user now says "move it", "move them", "yes", "move to X stage", "move her",
"move him" — use that lead's ID directly WITHOUT calling search_leads again. Never ask
"which lead?" if the lead was identified in the immediately preceding turn.
```

This is an instructions-level fix, not a code fix. Apply the same pattern to any SDK agent that does multi-turn lookups (Cal, Max, etc.).

### 66. Supabase column rename — update EVERY file that queries that column

When renaming a Supabase column (e.g. `clinic_name` → `organization_name`), grep ALL files for the old name:
```bash
grep -rn "clinic_name" lib/ app/ components/
```
Files that had `clinic_name` DB references: `lib/dash-agent.js`, `lib/max-agent.js`, `lib/iris-agent.js`, `lib/agents/iris.js`, `lib/agents/rex.js`, `lib/agent-handlers.js`, `app/api/intake/[token]/route.js`, `app/intake/[token]/page.js`, `components/ChatPanel.js`.
Any missed file causes a 500 error: `column agency_leads.clinic_name does not exist`.
**Rule:** After any Supabase column rename, do `replace_all: true` on every affected file before committing.

### 67. Vercel serverless kills fire-and-forget fetch after response is sent

`fetch(...).then(...).catch(...)` (fire-and-forget) inside a Next.js API route does NOT complete on Vercel — the serverless function is terminated the moment `return NextResponse.json(...)` runs. The fetch silently never happens.

**Fix:** Always `await` cross-service fetch calls inside the handler, before returning:
```ts
// ❌ Wrong — Vercel kills this before it runs
fetch(url, { ... }).then(...).catch(...)
return NextResponse.json({ success: true })

// ✅ Correct — awaited before response
try {
  const r = await fetch(url, { ... })
  console.log('response', r.status, await r.text())
} catch (err) { console.error(err) }
return NextResponse.json({ success: true })
```

### 68. Debug env vars in deployed functions with console.log

When a cross-service webhook silently fails on Vercel (no error, no 404, just nothing happens), the most common cause is a missing/wrong env var. Add a `console.log` before the call:
```ts
console.log('[DentaFlow] DENTAFLOW_WEBHOOK_URL =', process.env.DENTAFLOW_WEBHOOK_URL ?? 'NOT SET')
```
Then check Vercel → Project → Logs. If it says `NOT SET` or shows a placeholder like `https://your-dentaflow.vercel.app`, the env var was never properly set or was set to the template value.

### 69. Supabase RLS blocks anon key inserts — disable for internal tables

`outreach_schedule` had Row Level Security enabled, which blocked inserts from the anon key (used by the serverless functions). Error: `new row violates row-level security policy for table "outreach_schedule"`.
**Fix:**
```sql
ALTER TABLE outreach_schedule DISABLE ROW LEVEL SECURITY;
```
Apply to any table that is written to by server-side code using the anon key and doesn't need per-user access control.

### 70. Hide agents from UI without deleting code — use hidden: true flag

To temporarily hide an agent from the sidebar (Sara, Ayla, Atlas) without removing their code:
1. Add `hidden: true` to the agent definition in `lib/agents.js`
2. Filter in `app/page.js`: `agents={AGENTS.filter(a => !a.hidden)}`
Code stays intact for future use. Remove `hidden: true` to restore.

### 71. Duplicate lead detection returns "exists" — expected behavior

When the same email/phone is submitted again via the contact form, `processIntake()` returns `{ ok: true, status: "exists" }` — this is correct. The pipeline doesn't create duplicates.
**Testing:** Always use a fresh email when testing the form end-to-end. Real clients will always have new emails.

### 72. pre_meeting_reminder needs both lead-facing AND owner-facing steps

`pre_meeting_reminder` sequence must send 6 rows to `outreach_schedule` (3 to the lead + 3 to Donia). Add `toOwner: true` steps at the same `offsetMs` values (-3d, -24h, -1h). The `scheduleSequence()` function already supports `toOwner` — it sends to `process.env.OWNER_EMAIL` instead of `lead.email`. Owner steps should include lead name, org, email, phone, city, and meeting link so Donia has everything she needs at a glance.

### 73. scheduleSequence must always be awaited — fire-and-forget fails on Vercel

`scheduleSequence(...).catch(...)` (fire-and-forget) does NOT complete after the serverless function returns. This applies everywhere: `app/api/webhook/contact/route.js`, `lib/agent-handlers.js` submit-lead handler, and add-rex-leads handler.
**Fix:** Always `await scheduleSequence(...)` inside a `try/catch`.

### 74. pre_meeting_reminder auto-trigger — pass meetingDatetime from UI

When Dash's `move-stage` handler receives `toStage: "meeting_scheduled"`, it checks for `context.meetingDatetime`. If present, it auto-calls `scheduleSequence("pre_meeting_reminder", ...)` — fetching lead email/name/phone from Supabase if not already in context.

In the UI (`ChatPanel.js`), `dashMoveLeadStage()` intercepts `toStage === "meeting_scheduled"` and shows a `meetingModal` (datetime-local input + optional meeting link URL). On confirm it calls itself recursively with the datetime, which then calls the action with `meetingDatetime` in context.

**Pattern:** Any stage move that needs extra data before completing → add a React state modal, intercept in the move function, re-call with the captured data.
