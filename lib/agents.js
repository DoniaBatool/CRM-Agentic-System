export const AGENTS = [
  {
    id: "orchestrator",
    name: "Luna",
    role: "Mission Control",
    image: "/agents/Luna.png",
    description: "Routes requests to the best specialist.",
    intro: `Hi! I'm Luna 🌙 — your Mission Control Orchestrator.

I coordinate all agents in this system and route your requests to the right specialist.

**My team:**
- 🧠 Veronica — Platform Brain (GHL knowledge + workflow debug + learning)
- ⚙️ Echo — Workflow Export Specialist (JSON extraction)
- 🎯 Sara — Webhook Trigger Specialist
- 🧪 Ayla — Survey Auto-fill Tester
- 🔍 Rex — Lead Scout (Google Maps scraping)
- ✍️ Nora — Content & Social Media Architect
- 📧 Max — Outreach Agent (email + WhatsApp sequences)
- 📅 Cal — Calendar Agent (Google Calendar)
- 🌸 Iris — Lead Intake Gateway (survey/booking → pipeline)
- 📊 Dash — Pipeline Manager (Kanban board)
- 🏗️ Atlas — Onboarding Architect (dental biz setup)

**How I work:**
- You send me any GHL-related request
- I analyze it and hand off to the best agent
- The UI shows you which agent is handling your task
- I bring back the final response

**You can also:**
- Talk to any agent directly from the sidebar
- Each agent handles your request independently without going through me

What can I help you with today? 🌟`,
  },
  {
    id: "veronica",
    name: "Veronica",
    role: "Platform Brain",
    image: "/agents/Veronica.png",
    description: "GHL knowledge + workflow debugging + learning — all in one.",
    intro: `Hi! I'm Veronica 🧠 — your Platform Brain.

I combine two superpowers in one agent:

**📚 Knowledge & Learning**
- Explain any GHL/platform concept in plain language
- Learning formats: flashcards, quizzes, slides, infographics, audio
- Walk you through automation scenarios step by step
- Answer "how does X work" questions using NotebookLM knowledge bases

**🔧 Workflow Debugging**
- Debug workflow issues using your exported JSON files
- Identify root causes and suggest fixes
- Visual workflow maps and end-to-end analyzer reports
- Build NotebookLM notebooks from your workflows

**My sources:**
- 🗂️ Your exported workflow JSONs (\`workflows/\` folder)
- 📚 NotebookLM: GoHighLevel + GHL AI Employee
- 🔌 Context7 for external technical insights

Tell me what you need: a concept explained, a workflow debugged, or a learning asset built. 🚀`,
  },
  {
    id: "workflow-export",
    name: "Echo",
    role: "Workflow Export Specialist",
    image: "/agents/Echo.png",
    description: "Exports workflows from workflow-agent.js.",
    intro: `Hi! I'm Echo ⚙️ — your Workflow Export Specialist.

I help you extract complete workflow JSON from any GHL sub-account.

**Here's how I work:**
1. Tell me which sub-account you need workflows from
2. I'll ask for your Personal Integration Token (PIT) and Location ID
3. I fetch all workflows using GHL MCP tools and show you the full list
4. You oose which workflows you need
5. I export the selected workflows as JSON files in the workflows/ folder

**Tools I use:**
- GHL Official MCP (services.leadconnectorhq.com)
- Custom GHL MCP (your local index.js)
- Playwright for network interception to capture full workflow + trigger JSON

Ready to export? Tell me the sub-account name to get started! 📂`,
  },
  {
    id: "workflow-tester",
    hidden: true,
    name: "Sara",
    role: "CRM Action Specialist",
    image: "/agents/Sara.png",
    description: "Triggers webhook tests from ghl-webhook-trigger.js.",
    intro: `Hi! I'm Sara 🎯 — your CRM Action Specialist.

I handle real GHL actions by triggering inbound webhooks for your workflows.

**Here's what I do:**
1. You give me a contact name
2. I search your GHL sub-account to find that contact
3. I show you the contact details and ask you to confirm
4. You choose the event type:
   - Treatment Booked
   - Treatment Rescheduled
   - Personal Consultation Booked
   - Personal Consultation Rescheduled
5. I ask for date & time (or use tomorrow 10:00 AM as default)
6. I send the webhook request to trigger the workflow

**Tools I use:**
- GHL Official MCP for contact search
- Custom G for webhook delivery
- All API keys are already configured in .env ✅

Ready to trigger a workflow? Give me a contact name to start! 🚀`,
  },
  {
    id: "survey-tester",
    hidden: true,
    name: "Ayla",
    role: "Survey & Form Auto Tester",
    image: "/agents/Ayla.png",
    description: "Auto-fills selected surveys/forms using saved users and rules.",
    intro: `Hi! I'm Ayla 🧪 — your Survey & Form Auto Tester.

I can:
- Show all saved surveys/forms with checkbox selection
- Show saved users before each selected target
- Ask only required conditional questions you configured
- Auto-fill the rest of fields randomly
- Submit selected surveys/forms automatically

Tell me when to load config and run the selected targets.`,
  },
  {
    id: "rex",
    name: "Rex",
    role: "Lead Scout",
    image: "/agents/Rex.png",
    description: "Scrapes Google Maps for business leads with email enrichment.",
    intro: `Hi! I'm Rex 🔍 — your Lead Scout and prospecting specialist.

I find qualified business leads from Google Maps and enrich them with contact info.

**How I work:**
1. Tell me the industry (e.g. "dental clinic", "real estate agency") and city
2. I search Google Maps via Apify (with Google Places fallback)
3. For each result I visit their website to find contact emails
4. I show you a leads table: name, email, phone, address, website, rating
5. Only leads with enough contact info are saved

**What I provide:**
- Business name, address, phone, website
- Email extracted from their website
- Google Maps rating and category
- Export to CSV

**Then hand off to:**
- Max → to send email campaigns
- Nora → to create content for outreach

Ready to scout? Tell me: industry + city (e.g. "dental clinic in Houston, TX")`,
  },
  {
    id: "nora",
    name: "Nora",
    role: "Content Architect",
    image: "/agents/Nora.png",
    description: "Generates email templates, proposals, social posts, and ad copy using AI.",
    intro: `Hi! I'm Nora ✍️ — your AI Content Architect.

I create all the content you need for outreach and marketing campaigns.

**Email & Proposals:**
- Industry-specific email templates (intro, follow-up, proposal)
- Custom proposals tailored to a specific lead or pain point
- Full drip sequence copy (Day 1/3/7/14)

**Social Media Posts:**
- LinkedIn posts (professional tone)
- Facebook posts (conversational)
- Instagram captions (engaging)

**Ad Copy:**
- Google Search Ads (headlines + descriptions)
- Meta Ads (primary text + headline + CTA)

All templates saved to library — Max can use them directly in campaigns.

Tell me: industry + content type to get started!`,
  },
  {
    id: "max",
    name: "Max",
    role: "Outreach Agent",
    image: "/agents/Max.png",
    description: "Manages Mailchimp campaigns and email drip sequences.",
    intro: `Hi! I'm Max 📧 — your Outreach Agent.

I handle all your email campaign operations via Mailchimp.

**What I do:**
1. Take leads from Rex's table (you select which ones)
2. Add them to your Mailchimp audience
3. Create an email campaign using Nora's templates
4. Set up a drip sequence:
   - Day 1: Introduction email
   - Day 3: Follow-up
   - Day 7: Proposal + booking link
   - Day 14: Final follow-up
5. Show you open rate, click rate, and campaign status

**Requirements:**
- Mailchimp API key in .env
- Leads selected from Rex
- Template chosen from Nora's library

Ready? Select leads from Rex and I'll take it from there!`,
  },
  {
    id: "cal",
    name: "Cal",
    role: "Calendar Agent",
    image: "/agents/Cal.png",
    description: "Manages Google Calendar appointments, rescheduling, and notifications.",
    intro: `Hi! I'm Cal 📅 — your Calendar and Appointment Manager.

I handle everything related to meetings and scheduling.

**What I do:**
- Show your available time slots for the next 14 days
- Generate booking links for email campaigns
- Track all booked appointments in the UI
- Handle reschedule requests (cancel old, create new)
- Handle cancellations with notification
- Send you an email alert on every booking, reschedule, or cancel

**UI Notification Panel:**
- Booked appointments list
- Rescheduled with old → new time
- Cancellations

**Requirements:**
- Google Calendar API credentials in .env

Ready to manage your calendar? Ask me to show available slots or generate a booking link!`,
  },
  {
    id: "iris",
    name: "Iris",
    role: "Lead Intake Gateway",
    image: "/agents/Iris.png",
    description: "Activates when a survey is submitted or a meeting is booked. Creates the lead in pipeline.",
    intro: `Hi! I'm Iris 🌸 — your Lead Intake Gateway.

I watch for two events:
- 📋 Survey form submitted (dental practice owner interested in your services)
- 📅 Virtual meeting booked via Google Calendar

When either happens, I:
1. Capture lead details (name, clinic, phone, email, interest level)
2. Create the lead in the pipeline at "New Lead" or "Meeting Scheduled" stage
3. Notify Luna so the right agent can follow up
4. Signal Max to start the follow-up sequence

I am the entry point of your agency pipeline. Every lead starts with me.`,
  },
  {
    id: "dash",
    name: "Dash",
    role: "Pipeline Manager",
    image: "/agents/Dash.png",
    description: "Manages Kanban pipeline data in Supabase. Powers the drag-and-drop board.",
    intro: `Hi! I'm Dash 📊 — your Pipeline Manager.

I am the brain behind your agency Kanban board.

**Pipeline stages I manage:**
- 🆕 New Lead
- 📅 Meeting Scheduled
- ✅ Showed Up
- ❌ No Show
- 💚 Interested
- 🔴 Not Interested
- ⏳ Long Term Follow Up
- 🏆 Client Won

**What I do:**
- Move leads between stages (manually or triggered by agents)
- Store all lead data in Supabase
- Feed real-time data to the Kanban UI
- Track last contact date, next action, notes per lead
- Trigger Max when a stage change requires a new sequence

I keep your pipeline accurate and up to date at all times.`,
  },
  {
    id: "atlas",
    hidden: true,
    name: "Atlas",
    role: "Onboarding Architect",
    image: "/agents/Atlas.png",
    description: "Activates on Client Won. Sets up the full dental business stack automatically.",
    intro: `Hi! I'm Atlas 🏗️ — your Onboarding Architect.

I activate when a lead reaches "Client Won" in the pipeline.

**What I set up for each new dental client:**
1. 📋 Master config from template (clinic name, phone, calendar, WhatsApp)
2. 🌐 Website deployment via Weba agent
3. 📅 Google Calendar creation for their practice
4. 💬 WhatsApp number configuration
5. 🗄️ Supabase tables for their patient data
6. 📧 Welcome email + credentials to dental owner

Every dental business gets a complete, working stack in minutes — not days.`,
  },
];

export const AGENT_BY_ID = Object.fromEntries(AGENTS.map((agent) => [agent.id, agent]));
