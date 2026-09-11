# DentaFlow — Project Roadmap

> Last updated: 2026-06-07
> Current status: Agency System Phase 1 — 3 of 12 agents complete

---

## What We're Building

A **multi-agent SaaS platform** for dental marketing agencies.

**Phase 1 — Agency System:** Donia's internal operations (pipeline, outreach, content, calendar)
**Phase 2 — Dental Client System:** Per-client deployment (WhatsApp agent, patient bookings, website)

---

## ✅ Phase 1A — Foundation (COMPLETE)

| Done | What |
|---|---|
| ✅ | Vitest setup (ES Module config, 186 tests passing) |
| ✅ | Luna — keyword orchestrator with bug-fixed routing |
| ✅ | Veronica — merged Nova + Veronica into single platform brain |
| ✅ | Iris — lead intake agent (survey → pipeline, duplicate detection, stage routing) |
| ✅ | Dash — pipeline manager (Kanban data, stage transitions, validation) |
| ✅ | Supabase schema — agency_leads, pipeline_history tables |
| ✅ | CLAUDE.md — full project documentation |
| ✅ | Test suite — orchestrator, export-workflows, webhook-trigger, mcp-tools, iris, dash |

---

## 🔄 Phase 1B — Agency Agents (CURRENT SPRINT)

### 1. Cal — Google Calendar Agent
**File:** `lib/cal-agent.js`
**What it does:**
- Check available slots on Donia's calendar
- Book/reschedule/cancel meetings
- When Iris creates a `meeting_scheduled` lead → Cal auto-creates calendar event
- Return booking confirmation with Google Meet link

**Tech:** Google Calendar API (OAuth2), `googleapis` npm package

**Env vars needed:**
```
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_REFRESH_TOKEN=
GOOGLE_CALENDAR_ID=
```

**Key functions to build:**
- `getAvailableSlots(date)` → list of free 30-min windows
- `bookMeeting({ leadId, datetime, title, email })` → create event, return link
- `rescheduleMeeting({ eventId, newDatetime })` → update event
- `cancelMeeting(eventId)` → delete event

---

### 2. Max — Outreach Agent
**File:** `lib/max-agent.js`
**What it does:**
- Email sequences via Brevo (300/day free)
- WhatsApp follow-ups via Twilio
- Triggered by Dash stage changes (no_show → send reschedule message, interested → send proposal)
- Follow-up sequences: no-show reschedule, pre-meeting reminder, post-meeting follow-up, long-term nurture

**Tech:** Brevo SMTP (`nodemailer`), Twilio API

**Env vars needed:**
```
SMTP_HOST=smtp-relay.brevo.com
SMTP_USER=           (Brevo login email)
SMTP_PASS=           (Brevo SMTP key)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=
```

**Key functions to build:**
- `sendEmail({ to, subject, html, from })` → single email via Brevo
- `sendWhatsApp({ to, message })` → WhatsApp message via Twilio
- `triggerSequence({ leadId, trigger })` → run a named sequence (e.g. "no_show_reschedule")
- Sequence definitions: `sequences/` folder with JSON templates

**Sequences to build (triggered by Dash `followUpTrigger`):**
| Trigger | What happens |
|---|---|
| `no_show_reschedule` | WhatsApp: "Hi, we missed you — want to reschedule?" + email |
| `pre_meeting_reminder` | Email 24hr before meeting: reminder + agenda |
| `post_meeting_follow_up` | Email after showed_up: "Great meeting! Here's a quick recap..." |
| `interested_close_sequence` | Email: proposal + pricing + next steps |
| `long_term_nurture` | Monthly email: dental marketing tips |
| `onboarding_handoff` | Email to Donia: new client alert + setup checklist |

---

### 3. Nora — Content + Social Media Agent
**File:** `lib/nora-agent.js`
**What it does:**
- Generate content with GPT (captions, emails, ad copy, proposals)
- Create visuals via Canva MCP (already connected)
- Post to Facebook/Instagram via Meta Graph API (free)
- Content types: social posts, email templates, ad copy, onboarding proposal

**Tech:** OpenAI GPT-4o, Canva MCP, Meta Graph API

**Env vars needed:**
```
META_PAGE_ACCESS_TOKEN=
META_PAGE_ID=
```

**Key functions to build:**
- `generateCaption({ topic, tone, platform })` → GPT caption
- `generateEmailTemplate({ type, leadName, clinicName })` → email HTML
- `createCanvaPost({ caption, templateType })` → Canva MCP call
- `postToInstagram({ imageUrl, caption })` → Meta Graph API
- `postToFacebook({ imageUrl, caption })` → Meta Graph API

---

### 4. Atlas — Onboarding Agent
**File:** `lib/atlas-agent.js`
**What it does:**
- When a lead hits `client_won` → Atlas starts full dental business setup
- Creates client record in Supabase
- Sends onboarding survey link
- Prepares TAR config snapshot for that dental business
- Future: spins up per-client agents (Zara, Cal-D, Max-D, Nora-D)

**Dependencies:** Iris, Dash (must be complete), Max (for welcome email)

---

## 📋 Phase 1B — Test Coverage Plan

For each new agent, tests must cover:
1. Happy path (valid inputs, expected output)
2. Validation errors (missing required fields)
3. External API failure (mock returns error)
4. Dev fallback (no env vars / no Supabase)

**Test files to create:**
- `tests/cal-agent.test.js`
- `tests/max-agent.test.js`
- `tests/nora-agent.test.js`
- `tests/atlas-agent.test.js`

**Rule:** Run `npm test` after each agent. All tests must pass before moving to next.

---

## 🧠 Phase 1C — Memory Layer (after Phase 1B complete)

### The Problem
Right now every conversation starts from zero. Agents don't remember:
- "This lead always no-shows on Mondays"
- "This email subject line got 40% open rate"
- "We already tried LinkedIn outreach for this clinic"

### The Solution — Supabase `agent_memory` Table

```sql
CREATE TABLE agent_memory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id TEXT NOT NULL,          -- 'iris', 'max', 'dash', etc.
  memory_type TEXT NOT NULL,       -- 'episodic' | 'semantic' | 'procedural'
  key TEXT NOT NULL,               -- e.g. 'best_follow_up_day_no_show'
  value JSONB NOT NULL,            -- flexible payload
  confidence FLOAT DEFAULT 1.0,   -- 0.0 to 1.0
  source TEXT,                     -- 'observed' | 'manual' | 'inferred'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Memory Types Per Agent

| Agent | Memory Type | What to Store |
|---|---|---|
| Iris | Episodic | Duplicate leads, repeat sources, high-quality lead patterns |
| Dash | Episodic | Stage move history (in pipeline_history — already done) |
| Max | Semantic | Best-performing email subjects, best send times, response rates |
| Rex | Episodic | Already-scraped cities/clinics, contact attempts |
| Veronica | Semantic | Past debug solutions, common GHL error patterns |
| Cal | Episodic | Preferred meeting times per lead, no-show patterns |

### What NOT to Do
- ❌ Obsidian vault — designed for personal PKM, not SaaS agents
- ❌ Vector DB (Pinecone, Qdrant) — overkill until you have 10k+ records
- ❌ Full RAG pipeline for memory — too complex for this stage

### What DOES Apply from "Second Brain" Concept
| Second Brain Idea | DentaFlow Equivalent |
|---|---|
| CLAUDE.md as operating manual | ✅ Already have this |
| Session logs | ✅ Supabase chat_messages |
| Active setup (reads on demand) | ✅ agent_memory table (Phase 1C) |
| Skills route and link for you | ✅ Luna orchestrator |

---

## 🏗️ Phase 2 — Dental Client System (FUTURE)

> Start only after Phase 1B is fully live and tested.

### Per-Client Agents (deployed per dental business)

| Agent | What it does | Tech |
|---|---|---|
| Zara | WhatsApp AI patient agent — answers FAQs, books appointments | Twilio, GPT-4o |
| Cal-D | Google Calendar for dental patient bookings | Google Calendar API |
| Max-D | Patient appointment reminders + no-show follow-up | Brevo + Twilio |
| Nora-D | Dental social media content (treatments, tips, promos) | Canva MCP + Meta |
| Dash-D | Patient analytics — bookings, no-shows, revenue | Supabase |
| Weba | Website + booking form generator for dental clinic | Next.js templates |

### Multi-Tenant Architecture (how to deploy per client)

```
Supabase:
  dental_clients table     → one row per dental business
  client_config table      → per-client settings (calendar ID, WhatsApp number, etc.)
  patient_leads table      → per-client patient pipeline

Render:
  Single backend (ghl-mcp-server) handles all clients
  Agent handlers check client_id from request
  Config loaded from Supabase per request
```

### TAR Snapshot Concept
- When Atlas onboards a new dental client → saves their config as a JSON/TAR template
- Template includes: agent settings, follow-up sequences, content templates, calendar config
- Next client onboarding reuses the template (faster setup)
- Stored in: `snapshots/` folder per client

---

## 🚀 Deployment Plan

| Service | Platform | When |
|---|---|---|
| Frontend (Next.js) | Vercel | After Iris + Dash UI ready |
| Backend agents | Render (free tier) | After Cal + Max complete |
| Database | Supabase (free tier) | Already using |
| Domain | Custom (future) | Phase 2 |

**Important:** Render free tier sleeps after 15 min inactivity. Acceptable for Phase 1 (Donia's internal tool). Phase 2 (paying clients) → upgrade to Render paid ($7/mo).

---

## 🔑 Missing Env Vars (Action Items)

```env
NEXT_PUBLIC_SUPABASE_ANON_KEY=     ← GET FROM: Supabase Dashboard → Settings → API
GOOGLE_CALENDAR_CLIENT_ID=         ← GET FROM: Google Cloud Console → OAuth Credentials
GOOGLE_CALENDAR_CLIENT_SECRET=     ← same as above
GOOGLE_CALENDAR_REFRESH_TOKEN=     ← run OAuth flow once, save token
GOOGLE_CALENDAR_ID=                ← Google Calendar → Settings → Calendar ID
TWILIO_ACCOUNT_SID=                ← GET FROM: Twilio Console
TWILIO_AUTH_TOKEN=                 ← same as above
TWILIO_WHATSAPP_NUMBER=            ← Twilio WhatsApp Sandbox number
META_PAGE_ACCESS_TOKEN=            ← Facebook Developer Console → Graph API
META_PAGE_ID=                      ← Facebook Page Settings
```

---

## 📐 Patterns Doc (Reusable Intelligence)

> Location: `docs/patterns/` — auto-created when a task is repeated 2+ times

| Pattern | File | Use When |
|---|---|---|
| Adding a new agent | `docs/patterns/new-agent.md` | Every new agent follows same structure |
| Writing agent tests | `docs/patterns/agent-tests.md` | Test template for any new agent |
| Follow-up sequence | `docs/patterns/follow-up-sequence.md` | Adding a new Max trigger |
| Supabase table | `docs/patterns/supabase-table.md` | Adding a new data table |

---

## 📊 Current Test Count

| File | Tests | Status |
|---|---|---|
| orchestrator.test.js | 56 | ✅ |
| export-workflows.test.js | 25 | ✅ |
| ghl-webhook-trigger.test.js | 21 | ✅ |
| mcp-tools.test.js | 28 | ✅ |
| iris-agent.test.js | 37 | ✅ |
| dash-agent.test.js | 37 | ✅ |
| **Total** | **186** | ✅ All passing |

---

## 🐛 Known Gotchas (keyword routing bugs — already fixed)

1. `"book"` → matches inside `"facebook"` — fixed: use `"book appointment"` etc.
2. `"board"` → matches inside `"onboarding"` — fixed: removed from dash keywords
3. `"onboard"` → matches inside `"onboarding"` — fixed: atlas uses `"onboard client"`
4. `"stage"` → could match `"instagram"` — watch for this
5. vitest mock for OpenAI must be a class, not `vi.fn()`
6. `getPipelineStats` fallback must include `wonCount: 0`
