-- ─── DentaFlow Agency — Supabase Schema ────────────────────────────────────
-- Run this in Supabase SQL Editor to set up agency pipeline tables

-- ─── agency_leads ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agency_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Contact info
  name TEXT,
  email TEXT,
  phone TEXT,
  clinic_name TEXT,
  city TEXT,
  message TEXT,

  -- Intent signals
  source TEXT NOT NULL DEFAULT 'survey',  -- survey | calendar_booking | manual
  interest_level TEXT,
  treatments_offered TEXT[],

  -- Meeting info
  meeting_datetime TIMESTAMPTZ,
  calendar_event_id TEXT,

  -- Pipeline
  stage TEXT NOT NULL DEFAULT 'new_lead',
  -- Stages: new_lead | meeting_scheduled | showed_up | no_show |
  --         interested | not_interested | long_term_follow_up | client_won

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_agency_leads_email ON agency_leads(email);
CREATE INDEX IF NOT EXISTS idx_agency_leads_phone ON agency_leads(phone);
CREATE INDEX IF NOT EXISTS idx_agency_leads_stage ON agency_leads(stage);
CREATE INDEX IF NOT EXISTS idx_agency_leads_created ON agency_leads(created_at DESC);

-- ─── pipeline_history ──────────────────────────────────────────────────────
-- Tracks every stage move and note for a lead
CREATE TABLE IF NOT EXISTS pipeline_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES agency_leads(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT,
  note TEXT,
  moved_by TEXT DEFAULT 'system',  -- user | iris | dash | max | cal | system
  moved_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_history_lead ON pipeline_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_history_moved ON pipeline_history(moved_at DESC);

-- ─── Row Level Security ────────────────────────────────────────────────────
-- Enable RLS (uncomment when adding auth)
-- ALTER TABLE agency_leads ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE pipeline_history ENABLE ROW LEVEL SECURITY;

-- ─── Updated_at trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agency_leads_updated_at ON agency_leads;
CREATE TRIGGER agency_leads_updated_at
  BEFORE UPDATE ON agency_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Sara — Webhook Tester Tables ──────────────────────────────────────────

-- webhook_history: every webhook fired by Sara
CREATE TABLE IF NOT EXISTS webhook_history (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fired_at      TIMESTAMPTZ DEFAULT NOW(),
  contact_name  TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  event_type    TEXT,          -- "treatment" | "Personal Consultation" | custom
  action        TEXT,          -- "booked" | "rescheduled"
  webhook_url   TEXT,
  payload       JSONB,         -- full payload sent
  status_code   INT,           -- 200, 404, 500, null on network error
  status_text   TEXT,          -- "OK", "Not Found", etc.
  response_body TEXT,
  success       BOOLEAN,       -- status_code 2xx
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS idx_webhook_history_fired   ON webhook_history(fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_history_success ON webhook_history(success);
CREATE INDEX IF NOT EXISTS idx_webhook_history_event   ON webhook_history(event_type);

-- sara_custom_events: user-defined event types beyond the 4 hardcoded ones
CREATE TABLE IF NOT EXISTS sara_custom_events (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  event_label     TEXT NOT NULL,   -- display name: "Whitening Booked"
  event_type      TEXT NOT NULL,   -- payload value: "Whitening"
  action          TEXT NOT NULL,   -- "booked" | "rescheduled"
  webhook_url     TEXT,
  payload_template JSONB           -- default field overrides
);

-- sara_payload_templates: saved payload presets
CREATE TABLE IF NOT EXISTS sara_payload_templates (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name       TEXT NOT NULL,        -- "Standard Treatment Test"
  event_type TEXT,
  action     TEXT,
  payload    JSONB NOT NULL        -- saved field values
);

-- ─── Sara — Sub-Account Management ────────────────────────────────────────────

-- sub_accounts: GHL sub-accounts Sara can test webhooks for
CREATE TABLE IF NOT EXISTS sub_accounts (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  name        TEXT NOT NULL,             -- "Dental Client", "Bucktooth Marketing"
  location_id TEXT NOT NULL UNIQUE,      -- GHL location ID
  pit_token   TEXT NOT NULL              -- Personal Integration Token
);

CREATE INDEX IF NOT EXISTS idx_sub_accounts_location ON sub_accounts(location_id);

-- sub_account_webhooks: per-event webhook URLs for each sub-account
-- Built-in events are seeded here; custom events link via sub_account_id
CREATE TABLE IF NOT EXISTS sub_account_webhooks (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  sub_account_id UUID NOT NULL REFERENCES sub_accounts(id) ON DELETE CASCADE,
  event_label    TEXT NOT NULL,   -- "Treatment Booked"
  event_type     TEXT NOT NULL,   -- "treatment" | "Personal Consultation"
  action         TEXT NOT NULL,   -- "booked" | "rescheduled"
  webhook_url    TEXT,            -- null = not configured yet
  UNIQUE(sub_account_id, event_type, action)
);

CREATE INDEX IF NOT EXISTS idx_sub_acct_webhooks_account ON sub_account_webhooks(sub_account_id);

-- Add sub_account_id to custom events so each event knows its sub-account
ALTER TABLE sara_custom_events
  ADD COLUMN IF NOT EXISTS sub_account_id UUID REFERENCES sub_accounts(id) ON DELETE SET NULL;
