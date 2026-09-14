# FlowForge — Multi-Agent Automation Platform

> An AI-powered platform that automates business operations end-to-end for any industry: lead intake, pipeline management, outreach sequences, calendar booking, content creation, and workflow debugging — all driven by specialized AI agents.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          ENTRY POINTS                                    │
│                                                                          │
│   NovaFlow Website ──→  /api/webhook/contact                            │
│   Chat UI (browser) ──→  /api/chat                                      │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         🌙 LUNA — Mission Control                        │
│                  Keyword routing (no LLM, instant)                       │
│                     lib/orchestrator.js                                  │
└──┬───────┬──────┬──────┬─────┬───────┬──────┬──────┬────────────────────┘
   │       │      │      │     │       │      │      │
   ▼       ▼      ▼      ▼     ▼       ▼      ▼      ▼
  Iris    Dash   Max    Cal   Rex    Nora  Veronica  Echo
```

For the full interactive architecture diagram, see the [Excalidraw diagram](https://excalidraw.com) created with this project.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router) |
| Agent logic | Node.js ES Modules + OpenAI Agents SDK |
| Database | Supabase (PostgreSQL) |
| Email | Brevo SMTP (300 free emails/day) |
| WhatsApp | Twilio |
| Social Media | Meta Graph API + Canva Connect API |
| Lead Scraping | Apify (Google Maps Places Scraper) |
| Calendar | Google Calendar API |
| Browser Automation | Playwright (Echo, Ayla) |
| AI Models | OpenAI GPT-4o-mini |
| Testing | Vitest |
| Cron | cron-job.org (hits `/api/cron` every 30 min) |
| Deploy | Vercel (frontend) |

---

## Agents

Nine agents are active in the UI. Each handles a distinct domain and never steps outside it.

### 🌙 Luna — Mission Control
**File:** `lib/orchestrator.js`

Luna is the invisible router. Every message hits Luna first. She reads the intent via keyword matching (no LLM call — instant) and delegates to the right specialist. She never does work herself.

**Routes to:** All 8 specialist agents based on keywords in the user message.

---

### 🌸 Iris — Lead Intake Gateway
**Files:** `lib/iris-agent.js` + `lib/agents/iris.js`

Iris is the front door for every lead entering the system. She validates data, detects duplicates, creates leads in the pipeline, and signals Max to start outreach.

**Capabilities:**
- Accept leads from: website contact form (webhook), Rex pipeline, manual chat input
- Validate required fields: name + (email or phone)
- Detect duplicates by email/phone — returns existing lead instead of creating duplicate
- Create lead in `agency_leads` table at `new_lead` stage
- Bulk-add Rex scraping results via `add-rex-leads` action
- Signal Max to start `new_lead_sequence` immediately

**Supabase table:** `agency_leads`

---

### 📊 Dash — Pipeline Manager
**Files:** `lib/dash-agent.js` + `lib/agents/dash.js`

Dash owns the Kanban board. He tracks every lead's journey, moves them between stages, and logs every action.

**Pipeline stages:**
```
new_lead → meeting_scheduled → showed_up    → interested       → client_won
                             → no_show      → not_interested
                                            → long_term_follow_up
```

**Capabilities:**
- Full Kanban board display (8 stages, all leads)
- Move leads between any stage (no restrictions — user has full control)
- Log every move in `pipeline_history`
- Search leads by name (partial match)
- Add notes to leads
- Pipeline stats: total, won, conversion rate
- Auto-trigger Max when stage changes
- Drag-and-drop UI using `dataTransfer` API

**Supabase tables:** `agency_leads`, `pipeline_history`

---

### 📧 Max — Outreach Agent
**Files:** `lib/max-agent.js` + `lib/agents/max.js`

Max runs all automated email and WhatsApp sequences. He knows exactly when to reach out based on pipeline stage, and never spams.

**Email platform:** Brevo SMTP (`smtp-relay.brevo.com:587`) — 300 free emails/day, unlimited contacts. Configured via `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`.

**Sequences:**

| Sequence | Trigger | Timing | Auto-stage-move |
|---|---|---|---|
| `new_lead_sequence` | Lead enters `new_lead` | 0h, +24h, +3d, +7d, +15d | → `not_interested` after 15d |
| `interested_sequence` | Lead enters `interested` | 0h, +1d, +3d, +7d, +15d | → `long_term_nurture` after 15d |
| `pre_meeting_reminder` | Lead enters `meeting_scheduled` | -3d, -24h, -1h | — |
| `no_show_reschedule` | Lead enters `no_show` | +1h, +24h, +3d, +15d | → `long_term_nurture` |
| `not_interested_reengagement` | Lead enters `not_interested` | +24h, +3d, +7d, +15d | → `long_term_nurture` |
| `long_term_nurture` | Lead enters `long_term_nurture` | Every 30 days | — |
| `post_meeting_follow_up` | Lead enters `showed_up` | Immediately | — |
| `onboarding_handoff` | Lead enters `client_won` | Immediately | → Atlas |

**How emails are scheduled:** Max inserts rows into `outreach_schedule` with future `send_at` timestamps. `cron-job.org` hits `/api/cron` every 30 minutes, which picks up rows where `send_at <= NOW()` and `status = pending`, sends them via Brevo, then marks them `sent`.

**Supabase table:** `outreach_schedule`

---

### 📅 Cal — Calendar Agent
**Files:** `lib/cal-agent.js` + `lib/agents/cal.js`

Cal makes scheduling effortless. She shows available slots, books meetings, handles reschedules, and keeps the pipeline updated when bookings happen.

**Capabilities:**
- Show available time slots (next 14 days, Mon–Fri, 9am–5pm)
- Create Google Calendar appointments with auto Google Meet link
- Reschedule (cancel old + create new) and cancellations
- Send booking confirmation emails
- Generate booking links for Max email campaigns
- When meeting booked → move lead to `meeting_scheduled`

**Booking URL:** Set via `NEXT_PUBLIC_BOOKING_URL` env var (Google Calendar Appointment Scheduling link). Falls back to NovaFlow contact page.

---

### 🔍 Rex — Lead Scout
**Files:** `lib/rex-agent.js` + `lib/agents/rex.js`

Rex finds dental business prospects on Google Maps that nobody else can reach. He uses Apify's Google Maps Places Scraper — no raw Playwright scraping, no CAPTCHAs.

**Capabilities:**
- Scrape Google Maps for dental clinic leads using Apify (primary) or Google Places API (fallback)
- Post-filter by city for geographic accuracy
- Enrich leads: visit each website and extract email via regex
- Deduplicate against existing `rex_leads` in Supabase
- Add selected leads directly to agency pipeline (Iris)
- Export leads as CSV

**Supabase table:** `rex_leads`

---

### ✍️ Nora — Content Architect
**Files:** `lib/nora-agent.js` + `lib/agents/nora.js`

Nora writes content that converts. She understands dental marketing inside out and produces tailored content — never generic.

**Capabilities:**
- Generate email sequences (welcome, follow-up, proposal, drip)
- Generate custom proposals (personalized to lead name + pain point)
- Generate social media posts (LinkedIn, Facebook, Instagram)
- Generate ad copy (Google Search Ads, Meta Ads)
- Save templates to library for Max campaigns

**Model:** OpenAI GPT-4o-mini

---

### 🧠 Veronica — Platform Brain
**Files:** `lib/veronica-agent.js` + `lib/agents/veronica.js`

Veronica is the internal expert on GoHighLevel and the DentaFlow platform. She can explain any workflow, debug any issue, and answer any GHL question.

**Capabilities:**
- Answer GHL questions using NotebookLM knowledge base + web search
- Debug exported GHL workflow JSONs (dual analysis: NotebookLM + GPT-4o-mini in parallel)
- Explain what a workflow does step by step
- Browse exported workflow folders by sub-account
- Interactive folder browser panel in UI

---

### ⚙️ Echo — Workflow Export Specialist
**File:** `workflow-agent.js`

Echo captures exact GHL workflow JSON — including triggers — that the GHL UI doesn't expose directly. She uses Playwright + API interception.

**Capabilities:**
- List all workflows in a GHL sub-account via API
- Export workflow JSON + trigger JSON via Playwright network interception
- API-first (no browser if API works), Playwright fallback
- Save exports as JSON files in `workflows/{sub-account}/`
- Per-location auth files (`auth-{locationId}.json`) — login once per account
- Tabbed UI: GHL Workflows list vs Exported JSONs
- Resizable 2-column layout with drag handle

---

## Agent Collaboration Map

```
Website Contact Form
        │
        ▼ webhook
      IRIS ──── creates lead ───────────────► agency_leads (new_lead)
        │                                              │
        │                                              ▼
        │                                            DASH
        │                                    (Kanban board manager)
        │                                              │
        │                              stage change    │
        │                            ┌────────────────┤
        │                            │                │
        │                            ▼                ▼
        │                           MAX              CAL
        │                       (outreach)       (meetings)
        │                            │                │
        │                            ▼                │
        │                          NORA               │
        │                       (templates)           │
        │                                             ▼
        │                                     IRIS (meeting booked)
        │                                             │
        │                                             ▼ client_won
        └──────────────────────────────────────► ATLAS (future)

REX ──► scrapes leads ──► IRIS (add to pipeline) or MAX (email campaign)
VERONICA ◄──► ECHO (debug needs JSON export; JSON needs explanation)
LUNA — routes all messages to all agents above
```

---

## Project Structure

```
ghl-mcp-server/
├── app/
│   ├── api/
│   │   ├── chat/route.js           ← Main API endpoint (Luna → agents)
│   │   ├── cron/route.js           ← Picks up outreach_schedule rows, sends email/WhatsApp
│   │   ├── intake/[token]/route.js ← Lead interest form submission
│   │   └── webhook/contact/route.js ← NovaFlow website → Iris intake
│   └── page.js                     ← Chat UI
├── components/
│   ├── ChatPanel.js                ← Chat interface + all agent panels
│   └── AgentSidebar.js             ← Agent selector (9 visible agents)
├── lib/
│   ├── agents/                     ← OpenAI Agents SDK wrappers
│   │   ├── iris.js                 ← Iris SDK agent
│   │   ├── dash.js                 ← Dash SDK agent
│   │   ├── cal.js                  ← Cal SDK agent
│   │   ├── max.js                  ← Max SDK agent
│   │   ├── rex.js                  ← Rex SDK agent
│   │   ├── nora.js                 ← Nora SDK agent
│   │   ├── sara.js                 ← Sara SDK agent (hidden)
│   │   └── veronica.js             ← Veronica SDK agent
│   ├── agents.js                   ← Agent definitions (id, name, role, hidden flag)
│   ├── orchestrator.js             ← Luna: keyword routing
│   ├── agent-handlers.js           ← All agent handler logic (runAgent)
│   ├── supabase.js                 ← Supabase client + helpers
│   ├── max-agent.js                ← Email sequences, Brevo SMTP, scheduling
│   ├── iris-agent.js               ← Lead intake, duplicate detection
│   ├── dash-agent.js               ← Pipeline board, stage moves
│   ├── rex-agent.js                ← Apify scraping, lead enrichment
│   ├── nora-agent.js               ← Content generation (GPT-4o-mini)
│   ├── cal-agent.js                ← Google Calendar, slot management
│   ├── veronica-agent.js           ← GHL debug, NotebookLM, web search
│   ├── self-learning.js            ← System prompt overrides + interaction logging
│   └── compress-history.js         ← Chat history compression
├── workflow-agent.js               ← Echo: GHL workflow export (Playwright)
├── ghl-webhook-trigger.js          ← Sara: webhook trigger (hidden)
├── data/
│   └── supabase-schema.sql         ← Run in Supabase SQL Editor
├── workflows/                      ← Exported GHL workflow JSONs
│   ├── agency/
│   └── dental client/              ← 19 dental patient journey workflows
├── tests/                          ← Vitest test files
│   ├── orchestrator.test.js        ← 56 routing tests
│   ├── export-workflows.test.js    ← 25 export tests
│   ├── ghl-webhook-trigger.test.js ← 21 webhook tests
│   ├── mcp-tools.test.js           ← 28 MCP tool tests
│   ├── iris-agent.test.js
│   └── dash-agent.test.js
└── vitest.config.js
```

---

## Supabase Tables

| Table | Owner | Purpose |
|---|---|---|
| `agency_leads` | Iris, Dash | Main pipeline: all leads with stage, contact info, intake token |
| `pipeline_history` | Dash | Every stage move and note — full audit trail |
| `outreach_schedule` | Max, cron | All scheduled emails: send_at, status, channel, html |
| `chat_messages` | All agents | Per-agent chat history (loaded on mount, saved after each message) |
| `rex_leads` | Rex | Dental business leads from Google Maps scraping |

**Setup:** Run `data/supabase-schema.sql` in Supabase SQL Editor.

> Note: Disable Row Level Security on `outreach_schedule` — server-side anon key inserts will fail with RLS enabled.

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Email (Max — Brevo SMTP)
SMTP_HOST=smtp-relay.brevo.com
SMTP_USER=                        ← Brevo login email
SMTP_PASS=                        ← Brevo SMTP key (from Brevo dashboard)

# Owner/Contact
OWNER_EMAIL=thenovaflow999@gmail.com
CONTACT_EMAIL=thenovaflow999@gmail.com

# Booking
NEXT_PUBLIC_BOOKING_URL=          ← Google Calendar Appointment link

# AI
OPENAI_API_KEY=

# GHL (Echo, Sara, Ayla)
GHL_API_KEY=
GHL_LOCATION_ID=
GHL_BASE_URL=https://services.leadconnectorhq.com
GHL_API_VERSION=2021-07-28

# GHL Webhooks (Sara)
GHL_WEBHOOK_TREATMENT_BOOKED=
GHL_WEBHOOK_TREATMENT_RESCHEDULED=
GHL_WEBHOOK_PC_BOOKED=
GHL_WEBHOOK_PC_RESCHEDULED=

# Lead Scraping (Rex)
APIFY_API_KEY=

# WhatsApp (Max)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=

# Social Media (Nora)
META_PAGE_ACCESS_TOKEN=
META_PAGE_ID=
CANVA_CLIENT_ID=
CANVA_ACCESS_TOKEN=

# NovaFlow website webhook (Iris)
DENTAFLOW_WEBHOOK_SECRET=

# Cron security
CRON_SECRET=                      ← cron-job.org sends this as Bearer token
```

---

## How Routing Works

```
POST /api/chat
   │
   ▼
lib/orchestrator.js — resolveAgent(message)
   │  keyword matching (instant, no LLM)
   ▼
lib/agent-handlers.js — runAgent(agentId, message, context)
   │
   ├─ Pre-SDK block (UI panel actions — return early)
   │   └─ iris: submit-lead, get-pipeline-counts, get-recent-leads
   │   └─ dash: get-board, move-stage, get-lead-detail, add-note
   │   └─ veronica: browse-sub-accounts, explain-workflow, debug-workflow
   │   └─ sara: search-contacts, fire-webhook, get-sub-accounts
   │
   └─ SDK_AGENTS map → OpenAI Agents SDK → tool calls → response
       └─ echo, ayla → custom Playwright handlers (not SDK)
```

---

## Cron Job

Emails are NOT sent in real-time. They are scheduled in Supabase and picked up by cron.

**Cron provider:** [cron-job.org](https://cron-job.org) — external service, hits the endpoint every 30 minutes.  
**Endpoint:** `POST /api/cron`  
**Auth:** `Authorization: Bearer {CRON_SECRET}`  
**What it does:** Queries `outreach_schedule` for rows where `send_at <= NOW()` and `status = 'pending'`, sends via Brevo SMTP or Twilio WhatsApp, marks as `sent` or `failed`.

> Vercel Hobby plan only supports daily crons — `vercel.json` has `"crons": []` intentionally empty.

---

## Running Locally

```bash
# Install dependencies
npm install

# Start Next.js frontend
npm run dev   # http://localhost:3000

# Start MCP server (for Claude Desktop integration)
node index.js
```

---

## Testing

```bash
npm test              # run all tests once
npm run test:watch    # watch mode
npm run test:coverage # with coverage report
```

**Rule:** Any code change → run `npm test` before committing. All tests must pass.

---

## Deployment

| Service | Platform | URL |
|---|---|---|
| Frontend + API routes | Vercel | `https://dentaflow-woad-tau.vercel.app` |
| Database | Supabase | Free tier (500MB) |
| Cron | cron-job.org | Fires every 30 min |

---

## Hidden Agents (available in code, not shown in UI)

| Agent | ID | Purpose |
|---|---|---|
| Sara | `workflow-tester` | Triggers GHL webhooks for workflow testing |
| Ayla | `survey-tester` | Auto-fills GHL survey forms via Playwright |
| Atlas | `atlas` | Onboarding architect — deploys full dental client stack (future) |

To show a hidden agent: remove `hidden: true` from its definition in `lib/agents.js`.

---

## Future: Per-Dental-Business Agents

When a lead moves to `client_won`, Atlas activates and deploys a complete stack for that dental business:

| Agent | Role |
|---|---|
| Zara | WhatsApp patient agent (text + voice) |
| Cal-D | Google Calendar for dental bookings |
| Max-D | Patient appointment reminders |
| Nora-D | Dental social media content |
| Dash-D | Patient analytics dashboard |
| Weba | Website builder + form generator |

---

## Key Learnings & Gotchas

See [CLAUDE.md](./CLAUDE.md) — 74 documented learnings covering: Supabase quirks, OpenAI Agents SDK patterns, GHL workflow export edge cases, drag-and-drop implementation, CSS grid scrolling issues, and more.
