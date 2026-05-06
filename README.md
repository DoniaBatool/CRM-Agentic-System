# GHL Agent Hub

A Next.js full-stack multi-agent system built for GoHighLevel (GHL) automation. It combines a React UI with a fleet of specialized AI agents, each with its own role, tools, and memory — all orchestrated by a central routing agent.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Agents](#agents)
- [Custom MCP Server](#custom-mcp-server)
- [MCP Integrations](#mcp-integrations)
- [Playwright Role](#playwright-role)
- [Self-Learning System](#self-learning-system)
- [Chat History & Compression](#chat-history--compression)
- [Data Storage](#data-storage)
- [Environment Variables](#environment-variables)
- [Scripts](#scripts)
- [Setup & Running](#setup--running)

---

## Project Overview

GHL Agent Hub is a browser-based multi-agent dashboard where each agent handles a specific domain of GHL or business automation work. A central orchestrator (Luna) routes user queries to the right agent. Agents can also be accessed directly from the sidebar.

Key capabilities:
- Export and analyze GHL workflow JSONs
- Trigger and test GHL webhooks and workflows
- Auto-fill GHL surveys/forms using Playwright
- Scrape business leads from Google Maps (via Apify)
- Generate AI email sequences, proposals, social posts, and ad copy
- Manage Mailchimp email campaigns and drip sequences
- Manage Google Calendar appointments with owner notifications
- Debug GHL workflows using NotebookLM knowledge bases + Context7
- Persistent per-agent chat history via Supabase
- Context window compression to prevent agent hallucination

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Frontend | React 19, CSS (dark theme, custom) |
| Backend | Next.js API Routes (Node.js) |
| AI / LLM | Anthropic Claude (claude-haiku-4-5) |
| Browser Automation | Playwright (Chromium) |
| Lead Scraping | Apify (Google Maps actor), Google Places API |
| Email Campaigns | Mailchimp API v3 |
| Calendar | Google Calendar API (OAuth2) |
| Notifications | Nodemailer (SMTP / Gmail) |
| Database | Supabase (PostgreSQL) |
| MCP Protocol | @modelcontextprotocol/sdk |
| NotebookLM CLI | `nlm` (custom CLI tool) |
| External Context | Context7 API |
| Schema Validation | Zod |
| HTTP Client | Axios |
| Runtime | Node.js (ESM) |

---

## Project Structure

```
ghl-mcp-server/
│
├── app/                          # Next.js App Router
│   ├── api/chat/route.js         # Central API endpoint — all agent calls go here
│   ├── globals.css               # Full dark-theme UI styles
│   ├── layout.js                 # Root HTML layout
│   └── page.js                   # Main page — renders sidebar + chat
│
├── components/
│   ├── AgentSidebar.js           # Agent list sidebar (avatars, roles, active state)
│   └── ChatPanel.js              # Full chat interface + all agent UI panels
│
├── lib/
│   ├── agents.js                 # Agent registry (id, name, role, image, intro)
│   ├── orchestrator.js           # Luna routing logic (keyword-based intent)
│   ├── agent-handlers.js         # Central dispatcher for all agent actions
│   ├── self-learning.js          # Agent reflection + prompt improvement (Anthropic)
│   ├── supabase.js               # Supabase client, chat history & leads helpers
│   ├── compress-history.js       # Chat history summarization (Anthropic, server-side)
│   ├── veronica-agent.js         # Workflow Intelligence Architect logic
│   ├── survey-agent.js           # Survey/Form auto-fill logic (Playwright)
│   ├── rex-agent.js              # Lead scraping logic (Apify + Google Places)
│   ├── nora-agent.js             # AI content generation (Anthropic)
│   ├── max-agent.js              # Mailchimp campaign management
│   └── cal-agent.js              # Google Calendar + notifications
│
├── index.js                      # Custom GHL MCP Server (9 tools, runs standalone)
├── ghl-assistant.js              # Nova — NotebookLM query runner (nlm CLI)
├── ghl-webhook-trigger.js        # Sara — GHL contact search + webhook trigger
├── workflow-agent.js             # Echo — Playwright-based workflow JSON exporter
│
├── workflows/                    # Exported GHL workflow JSONs (per sub-account)
├── data/                         # Runtime data files
│   ├── rex-leads.json            # Scraped leads (local backup)
│   ├── nora-templates.json       # AI-generated content templates
│   ├── cal-appointments.json     # Booked appointments
│   ├── survey-targets.json       # Survey/form URLs and names
│   ├── test-users.json           # Test user profiles for surveys
│   ├── survey-conditional-questions.json  # Per-survey conditional answers
│   └── survey-agent-settings.json         # Ayla global settings
│
├── public/agents/                # Agent avatar images (PNG)
├── public/survey-assets/         # Upload assets for surveys (e.g. logo)
├── scripts/
│   └── kill-playwright-browsers.sh  # Force-kill stuck Playwright processes
│
├── .agent-memory/                # Agent self-learning memory (gitignored)
├── .env                          # Environment variables (gitignored)
├── .env.example                  # Template for all required env vars
├── next.config.js                # Next.js config (Playwright as external package)
└── package.json                  # Dependencies + scripts
```

---

## Agents

### Luna — Mission Control Orchestrator
**File:** `lib/orchestrator.js` + `lib/agent-handlers.js`  
**Role:** Routes every user message to the right specialist agent using keyword-based intent scoring. Shows "Routing to [Agent]..." in the UI before handing off. Can also be chatted with directly.

---

### Nova — GHL Knowledge Coach
**File:** `ghl-assistant.js`  
**Role:** Answers any GHL-related question by querying two NotebookLM knowledge bases:
- GoHighLevel (ID: `b7efb8aa-d135-4fc8-940c-3e6bd23dc795`)
- GoHighLevel AI Employee (ID: `2a026e4a-611e-4932-b711-f8b829102902`)

**Tools used:** `nlm` CLI (NotebookLM MCP), cross-notebook query mode  
**Supports:** Explanations, flashcards, quizzes, infographics, audio overviews, slides, visual diagrams

---

### Echo — Workflow Export Specialist
**File:** `workflow-agent.js`  
**Role:** Logs into GHL sub-accounts and exports complete workflow JSONs (including trigger JSON) to sub-account-named folders inside `workflows/`.

**Tools used:** Playwright (network interception), GHL Official MCP, Custom GHL MCP  
**UI Features:** Checkbox list, search filter, Select All, export selected, delete selected

---

### Sara — CRM Action Specialist
**File:** `ghl-webhook-trigger.js`  
**Role:** Searches GHL contacts and triggers inbound webhooks to activate workflows. Supports events: Treatment Booked, Treatment Rescheduled, Personal Consultation Booked/Rescheduled.

**Tools used:** Custom GHL MCP (`find_contact`, `trigger_workflow`, `send_inbound_webhook`)

---

### Veronica — Workflow Intelligence Architect
**File:** `lib/veronica-agent.js`  
**Role:** The most powerful agent. Analyzes exported workflow JSONs, debugs issues, explains automations, and generates multi-format learning assets.

**Capabilities:**
- Debug workflow issues using workflow JSON + NotebookLM + Context7
- Explain all existing workflows (one by one)
- Generate brief and deep end-to-end automation reports
- Auto-create NotebookLM notebooks from workflow JSONs
- Generate slides, infographics, audio, multi-format explainers via `nlm` CLI
- Query Context7 for external technical documentation

**Tools used:** `nlm` CLI (NotebookLM), Context7 API, local workflow JSON files, Custom GHL MCP

---

### Ayla — Survey & Form Auto Tester
**File:** `lib/survey-agent.js`  
**Role:** Automates filling and submitting GHL surveys and external forms using Playwright. Supports multi-page forms, conditional questions, file uploads, calendar pickers, and Cloudflare challenge bypass (manual checkpoint mode).

**Surveys/Forms configured:**
- Survey #1, #2, #3 (GHL widget surveys)
- Nurtura Onboarding, Plan Picker, Solo Plan, Practice Plan

**Tools used:** Playwright (Chromium), `data/survey-targets.json`, `data/test-users.json`, `data/survey-conditional-questions.json`  
**Special features:** Manual verification checkpoint, session persistence via `globalThis`, iframe-aware form filling

---

### Rex — Lead Scout
**File:** `lib/rex-agent.js`  
**Role:** Scrapes business leads from Google Maps by industry and city. Enriches leads with emails scraped directly from business websites.

**Scraping pipeline:**
1. Primary: Apify `compass/crawler-google-places` actor
2. Fallback: Google Places Text Search + Details API (if Apify credits exhausted)
3. Email enrichment: fetches each business website and regex-matches `contact@`, `info@` patterns

**Data captured:** name, email, phone, address, city, website, rating, review count, category, source  
**Storage:** Supabase `rex_leads` table + local `data/rex-leads.json`  
**UI Features:** Search, Load Saved, Export CSV, Clear All, Send to Max, Filter by industry/city/email presence, Sort by name/rating/city/newest, Sortable column headers

---

### Nora — Content Architect
**File:** `lib/nora-agent.js`  
**Role:** Generates AI-powered content using Anthropic Claude. All generated content is saved to a reusable library.

**Content types:**
- Email drip sequences (4 emails: intro, follow-up, proposal, final)
- Business proposals (personalized per lead)
- Social media posts (LinkedIn, Facebook, Instagram)
- Ad copy (Google Ads, Meta Ads)

**Tools used:** Anthropic Claude API  
**Storage:** Supabase `nora_templates` (planned) + local `data/nora-templates.json`

---

### Max — Outreach Agent
**File:** `lib/max-agent.js`  
**Role:** Manages Mailchimp email campaigns. Adds leads from Rex, creates drip sequences using Nora's templates, tracks campaign performance.

**Capabilities:**
- Add Rex leads to Mailchimp audience (upsert via MD5 hash)
- Create individual campaigns or full 4-email drip sequences (Day 0/3/7/14)
- Send or schedule campaigns
- View campaign stats (open rate, click rate)
- List all campaigns with status

**Tools used:** Mailchimp Marketing API v3

---

### Cal — Calendar Agent
**File:** `lib/cal-agent.js`  
**Role:** Manages Google Calendar appointments and sends email notifications on every event.

**Capabilities:**
- Show available time slots (freeBusy API)
- Book appointments (creates Google Calendar event)
- Reschedule appointments
- Cancel appointments
- Generate shareable booking links
- Send owner email notifications on book/reschedule/cancel

**Tools used:** Google Calendar API (OAuth2), Nodemailer (SMTP/Gmail)

---

## Custom MCP Server

**File:** `index.js`  
**Run with:** `npm run start:mcp`

A fully custom Model Context Protocol server built with `@modelcontextprotocol/sdk`. It exposes 9 tools that give AI agents direct access to GHL's API:

| Tool | Description |
|------|-------------|
| `list_workflows` | List all workflows in a GHL location |
| `get_workflow` | Get full details of a specific workflow by ID |
| `send_inbound_webhook` | Send a custom request to a GHL inbound webhook URL |
| `test_workflow_webhook` | Trigger a workflow with sample contact data |
| `update_workflow_status` | Publish or unpublish a workflow |
| `find_contact` | Search GHL contacts by email, phone, or name |
| `trigger_workflow` | Add an existing contact to any workflow |
| `remove_contact_from_workflow` | Remove a contact from a workflow (post-test cleanup) |
| `test_run_workflow` | Full test run — creates temp contact, triggers workflow, reports result |

The server communicates via **stdio transport** and is used by Sara and Veronica agents to perform real GHL operations.

---

## MCP Integrations

### 1. Custom GHL MCP (this project)
- **File:** `index.js`
- **Transport:** stdio
- **Used by:** Sara, Veronica
- **Purpose:** Direct GHL API access — workflows, contacts, webhooks

### 2. GHL Official MCP
- **Endpoint:** `https://services.leadconnectorhq.com`
- **Used by:** Echo, Sara
- **Purpose:** Official GHL tooling for workflow listing and contact operations

### 3. NotebookLM MCP (via `nlm` CLI)
- **Tool:** `nlm` command-line interface
- **Used by:** Nova, Veronica
- **Purpose:** Query GoHighLevel knowledge bases, generate slides, infographics, audio overviews, and create new notebooks from workflow JSONs
- **Notebooks configured:**
  - GoHighLevel KB: `b7efb8aa-d135-4fc8-940c-3e6bd23dc795`
  - GoHighLevel AI Employee KB: `2a026e4a-611e-4932-b711-f8b829102902`

### 4. Context7 MCP
- **Endpoint:** `https://context7.com/api`
- **Used by:** Veronica
- **Purpose:** Fetch external technical documentation and implementation context for workflow debugging

---

## Playwright Role

Playwright (Chromium) is used in three agents for browser automation:

### Echo — Workflow Export
- Logs into GHL sub-account using Personal Integration Token
- Intercepts network requests to capture full workflow + trigger JSON that is not available via API
- Saves each workflow as a separate JSON file in `workflows/{sub-account-name}/`

### Ayla — Survey Auto-Fill
- Opens target survey/form URLs in a Chromium browser
- Fills all form fields (text, dropdowns, checkboxes, radio buttons, date pickers, file uploads)
- Handles multi-page forms by detecting and clicking Next/Submit buttons
- Detects Cloudflare challenges and pauses for manual resolution (manual checkpoint mode)
- Supports iframe-embedded forms
- Session persisted via `globalThis.__ghlSurveySessions` to survive Next.js module hot-reloads

### Rex — Email Enrichment
- Fetches business website HTML pages
- Extracts email addresses using regex patterns (`contact@`, `info@`, `mailto:` links)

**Process management:** `scripts/kill-playwright-browsers.sh` + `npm run kill:browsers` to force-terminate stuck Chromium processes.

---

## Self-Learning System

**File:** `lib/self-learning.js`

Every agent interaction is recorded. Every 10 interactions, Anthropic Claude reviews the last 10 exchanges and rewrites the agent's system prompt to be more effective based on real usage patterns.

- Memory stored in `.agent-memory/{agent-name}-memory.json` (gitignored)
- Each memory file contains: `interactions[]`, `systemPrompt`, `lastReflection`
- Improved system prompt is automatically used on subsequent calls via `getSystemPrompt(agentId, defaultPrompt)`

---

## Chat History & Compression

**Files:** `lib/supabase.js`, `lib/compress-history.js`

### Persistence
- All chat messages saved to Supabase `chat_messages` table
- Per-agent isolation — switching agents loads that agent's own history
- Up to 200 messages loaded per agent on switch
- Page refresh does not lose history

### Context Compression
- Runs server-side in `app/api/chat/route.js`
- If chat history exceeds 20 messages, Anthropic summarizes the older portion into 3–5 sentences
- Last 6 messages always kept verbatim
- Prevents context window overflow and agent hallucination in long conversations

### Supabase Tables Required

```sql
-- Chat history
create table chat_messages (
  id uuid default gen_random_uuid() primary key,
  agent_id text not null,
  role text not null,
  text text not null,
  handled_by text,
  created_at timestamptz default now()
);
create index on chat_messages(agent_id, created_at);

-- Rex leads
create table rex_leads (
  id text primary key,
  name text,
  email text,
  phone text,
  address text,
  city text,
  website text,
  rating numeric,
  category text,
  source text,
  industry text,
  scraped_at timestamptz default now()
);
create index on rex_leads(industry);
create index on rex_leads(city);
```

---

## Data Storage

| Data | Storage |
|------|---------|
| Chat messages | Supabase `chat_messages` |
| Scraped leads | Supabase `rex_leads` + `data/rex-leads.json` |
| Nora templates | `data/nora-templates.json` |
| Cal appointments | `data/cal-appointments.json` |
| Survey targets | `data/survey-targets.json` |
| Test users | `data/test-users.json` |
| Conditional questions | `data/survey-conditional-questions.json` |
| Exported workflows | `workflows/{sub-account-name}/*.json` |
| Agent memory | `.agent-memory/{agent-name}-memory.json` |

---

## Environment Variables

All variables are documented in `.env.example`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Apify (Rex lead scraping)
APIFY_API_TOKEN=
GOOGLE_PLACES_API_KEY=        # Fallback if Apify credits exhausted

# Mailchimp (Max campaigns)
MAILCHIMP_API_KEY=
MAILCHIMP_SERVER_PREFIX=      # e.g. us1
MAILCHIMP_LIST_ID=
MAILCHIMP_FROM_NAME=
MAILCHIMP_REPLY_TO=

# Google Calendar (Cal)
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_REFRESH_TOKEN=
GOOGLE_CALENDAR_ACCESS_TOKEN=
GOOGLE_CALENDAR_ID=           # "primary" or specific calendar ID
OWNER_EMAIL=                  # Receives all appointment notifications

# SMTP (Cal notifications)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=

# Context7 (Veronica)
CONTEXT7_API_KEY=
CONTEXT7_API_URL=https://context7.com/api

# GHL (Custom MCP + Sara)
GHL_API_KEY=
GHL_LOCATION_ID=
GHL_BASE_URL=https://services.leadconnectorhq.com
GHL_API_VERSION=2021-07-28
GHL_WEBHOOK_TREATMENT_BOOKED=
GHL_WEBHOOK_TREATMENT_RESCHEDULED=
GHL_WEBHOOK_PC_BOOKED=
GHL_WEBHOOK_PC_RESCHEDULED=

# Anthropic (Nora, self-learning, compression)
ANTHROPIC_API_KEY=
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js development server on port 3000 |
| `npm run build` | Build production bundle |
| `npm run start` | Start production server |
| `npm run start:mcp` | Run the custom GHL MCP server (stdio) |
| `npm run kill:browsers` | Force-kill all stuck Playwright Chromium processes |

---

## Setup & Running

### Prerequisites
- Node.js 18+
- `nlm` CLI installed and authenticated (for Nova and Veronica)
- Supabase project with the two tables created (see SQL above)
- API keys for the services you want to use (each agent works independently)

### Install

```bash
git clone <repo>
cd ghl-mcp-server
npm install
```

### Configure

```bash
cp .env.example .env
# Fill in your API keys in .env
```

### Install Playwright browsers

```bash
npx playwright install chromium
```

### Run

```bash
npm run dev
# Open http://localhost:3000
```

### Run Custom MCP Server (optional, for Sara/Veronica)

```bash
npm run start:mcp
```

---

## Agent Routing Map (Luna)

```
User message → Luna (Orchestrator)
    │
    ├── "learn", "how does", "ghl", "explain"          → Nova
    ├── "export", "json", "extract", "download"         → Echo
    ├── "contact", "trigger", "webhook", "book"         → Sara
    ├── "debug", "workflow issue", "fix", "analyze"     → Veronica
    ├── "survey", "form", "auto fill", "ayla"           → Ayla
    ├── "lead", "scrape", "google maps", "prospect"     → Rex
    ├── "email template", "proposal", "social post"     → Nora
    ├── "mailchimp", "campaign", "drip", "sequence"     → Max
    └── "appointment", "calendar", "booking", "slot"    → Cal
```
