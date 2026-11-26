-- Meridian schema (idempotent). Applied by `npm run db:migrate`.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('executive','director','ae','bdr','admin')),
  password_hash text,
  totp_secret_enc text,
  mfa_enabled boolean NOT NULL DEFAULT false,
  lang text NOT NULL DEFAULT 'en',
  timezone text NOT NULL DEFAULT 'Asia/Dubai',
  work_week text NOT NULL DEFAULT 'mon-fri' CHECK (work_week IN ('mon-fri','sun-thu')),
  currency text NOT NULL DEFAULT 'AED',
  theme text NOT NULL DEFAULT 'light',
  countries text[] NOT NULL DEFAULT '{}',
  sectors text[] NOT NULL DEFAULT '{}',
  manager_id uuid REFERENCES users(id),
  active boolean NOT NULL DEFAULT true,
  invite_token text,
  invite_expires timestamptz,
  failed_logins int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mfa_passed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text,
  entity_id text,
  meta jsonb NOT NULL DEFAULT '{}',
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_at ON audit_log(at DESC);

CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value jsonb NOT NULL);

CREATE TABLE IF NOT EXISTS sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  type text NOT NULL CHECK (type IN ('rss','sitemap','listing','page','search')),
  lang text NOT NULL DEFAULT 'en',
  country text NOT NULL DEFAULT 'AE',
  category text NOT NULL DEFAULT 'news',
  frequency_min int NOT NULL DEFAULT 360,
  priority int NOT NULL DEFAULT 3,
  quality int NOT NULL DEFAULT 3,
  store_full_text boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT false,
  terms_checked boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  run_count int NOT NULL DEFAULT 0,
  error_count int NOT NULL DEFAULT 0,
  items_found int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(url)
);

CREATE TABLE IF NOT EXISTS snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES sources(id) ON DELETE SET NULL,
  url text NOT NULL,
  title text NOT NULL,
  excerpt text NOT NULL DEFAULT '',
  body text,
  title_translated text,
  excerpt_translated text,
  lang text NOT NULL DEFAULT 'en',
  content_hash text NOT NULL,
  published_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  origin text NOT NULL DEFAULT 'crawl' CHECK (origin IN ('crawl','manual_url','upload','demo')),
  added_by uuid REFERENCES users(id),
  is_demo boolean NOT NULL DEFAULT false,
  UNIQUE(content_hash)
);
CREATE INDEX IF NOT EXISTS snapshots_title_trgm ON snapshots USING gin (title gin_trgm_ops);

CREATE TABLE IF NOT EXISTS organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en text NOT NULL,
  name_ar text,
  aliases text[] NOT NULL DEFAULT '{}',
  sector text NOT NULL DEFAULT 'other',
  country text NOT NULL DEFAULT 'AE',
  org_type text NOT NULL DEFAULT 'private' CHECK (org_type IN ('government','semi_government','private','smb','startup')),
  size_band text NOT NULL DEFAULT 'unknown',
  contact_volume_band text NOT NULL DEFAULT 'unknown',
  parent_id uuid REFERENCES organisations(id),
  website text,
  notes text NOT NULL DEFAULT '',
  is_competitor boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orgs_name_trgm ON organisations USING gin (name_en gin_trgm_ops);

CREATE TABLE IF NOT EXISTS org_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  title text,
  org_id uuid REFERENCES organisations(id) ON DELETE CASCADE,
  source_url text NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  is_demo boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  title_en text,
  summary text NOT NULL DEFAULT '',
  lang text NOT NULL DEFAULT 'en',
  signal_type text NOT NULL,
  track text NOT NULL CHECK (track IN ('enterprise','smb','competitor','against')),
  org_id uuid REFERENCES organisations(id) ON DELETE SET NULL,
  country text NOT NULL DEFAULT 'AE',
  sector text NOT NULL DEFAULT 'other',
  amount_usd numeric,
  deadline date,
  published_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  fingerprint text NOT NULL,
  classification_method text NOT NULL DEFAULT 'rules',
  scores jsonb NOT NULL DEFAULT '{}',
  total int NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'watchlist' CHECK (tier IN ('leader','team','watchlist')),
  confidence text NOT NULL DEFAULT 'low' CHECK (confidence IN ('high','medium','low')),
  extracted jsonb NOT NULL DEFAULT '{}',
  is_demo boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS signals_title_trgm ON signals USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS signals_seen ON signals(first_seen_at DESC);

CREATE TABLE IF NOT EXISTS signal_sources (
  signal_id uuid NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  PRIMARY KEY (signal_id, snapshot_id)
);

CREATE TABLE IF NOT EXISTS offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  pitch_en text NOT NULL,
  pitch_ar text NOT NULL,
  ideal_signals text[] NOT NULL DEFAULT '{}',
  ideal_sectors text[] NOT NULL DEFAULT '{}',
  ideal_types text[] NOT NULL DEFAULT '{}',
  proof_points jsonb NOT NULL DEFAULT '[]',
  source_url text,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS plays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  org_id uuid REFERENCES organisations(id) ON DELETE SET NULL,
  headline text NOT NULL,
  headline_ar text,
  why_now jsonb NOT NULL DEFAULT '[]',
  buyer_roles text[] NOT NULL DEFAULT '{}',
  offer_keys text[] NOT NULL DEFAULT '{}',
  proof_point text,
  value_low_usd numeric,
  value_high_usd numeric,
  size_band text,
  scores jsonb NOT NULL DEFAULT '{}',
  total int NOT NULL DEFAULT 0,
  tier text NOT NULL,
  confidence text NOT NULL,
  owner_id uuid REFERENCES users(id),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','accepted','snoozed','dismissed')),
  dismiss_reason text,
  snooze_until date,
  outreach jsonb NOT NULL DEFAULT '{}',
  outreach_method text NOT NULL DEFAULT 'template',
  risks jsonb NOT NULL DEFAULT '[]',
  deal_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_demo boolean NOT NULL DEFAULT false,
  UNIQUE(signal_id)
);

CREATE TABLE IF NOT EXISTS play_outcomes (
  id bigserial PRIMARY KEY,
  play_id uuid NOT NULL REFERENCES plays(id) ON DELETE CASCADE,
  outcome text NOT NULL,
  reason text,
  signal_type text,
  total int,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stages (
  key text PRIMARY KEY,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  sort int NOT NULL,
  probability int NOT NULL,
  entry_criteria text[] NOT NULL DEFAULT '{}',
  norm_days int NOT NULL DEFAULT 30,
  stale_days int NOT NULL DEFAULT 14,
  is_closed boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organisations(id) ON DELETE SET NULL,
  title text NOT NULL,
  track text NOT NULL DEFAULT 'enterprise' CHECK (track IN ('enterprise','smb')),
  country text NOT NULL DEFAULT 'AE',
  sector text NOT NULL DEFAULT 'other',
  offer_keys text[] NOT NULL DEFAULT '{}',
  tcv numeric NOT NULL DEFAULT 0,
  annual_value numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'AED',
  stage text NOT NULL REFERENCES stages(key),
  probability_override int,
  expected_close date,
  owner_id uuid REFERENCES users(id),
  source text NOT NULL DEFAULT 'other' CHECK (source IN ('meridian','referral','inbound','event','other')),
  play_id uuid REFERENCES plays(id) ON DELETE SET NULL,
  economic_buyer text,
  champion text,
  compelling_event text,
  decision_date date,
  scope_recorded boolean NOT NULL DEFAULT false,
  competitors text[] NOT NULL DEFAULT '{}',
  next_step text,
  next_step_date date,
  notes text NOT NULL DEFAULT '',
  owner_commit boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost','no_decision')),
  close_reason text,
  close_note text,
  final_value numeric,
  closed_at timestamptz,
  close_date_pushes int NOT NULL DEFAULT 0,
  stage_entered_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  value_change_unexplained boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  is_demo boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS deal_history (
  id bigserial PRIMARY KEY,
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),
  field text NOT NULL,
  old_value text,
  new_value text,
  note text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deal_history_deal ON deal_history(deal_id, at DESC);

CREATE TABLE IF NOT EXISTS deal_signals (
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  signal_id uuid NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  PRIMARY KEY (deal_id, signal_id)
);

CREATE TABLE IF NOT EXISTS targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter text NOT NULL,
  country text NOT NULL DEFAULT 'ALL',
  sector text NOT NULL DEFAULT 'ALL',
  track text NOT NULL DEFAULT 'ALL',
  amount_usd numeric NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  UNIQUE (quarter, country, sector, track)
);

CREATE TABLE IF NOT EXISTS fx_rates (currency text PRIMARY KEY, per_usd numeric NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country text NOT NULL,
  service_type text NOT NULL,
  min_usd_per_seat_month numeric NOT NULL,
  max_usd_per_seat_month numeric NOT NULL,
  is_placeholder boolean NOT NULL DEFAULT true,
  UNIQUE(country, service_type)
);

CREATE TABLE IF NOT EXISTS competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person_name text NOT NULL,
  person_title text,
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  strength text NOT NULL CHECK (strength IN ('strong','medium','weak')),
  context text NOT NULL DEFAULT '',
  last_contact date,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_demo boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text NOT NULL DEFAULT 'Dubai',
  start_date date NOT NULL,
  end_date date NOT NULL,
  sectors text[] NOT NULL DEFAULT '{}',
  keywords text[] NOT NULL DEFAULT '{}',
  notes text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  lang text NOT NULL,
  content jsonb NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  href text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  stored_path text NOT NULL,
  text text NOT NULL,
  lang text NOT NULL DEFAULT 'en',
  extracted jsonb NOT NULL DEFAULT '{}',
  method text NOT NULL DEFAULT 'rules',
  decision text,
  deal_id uuid REFERENCES deals(id) ON DELETE SET NULL,
  uploaded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_usage (
  id bigserial PRIMARY KEY,
  task text NOT NULL,
  model text NOT NULL,
  input_tokens int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  cost_usd numeric NOT NULL DEFAULT 0,
  ok boolean NOT NULL DEFAULT true,
  cached boolean NOT NULL DEFAULT false,
  error text,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_cache (key text PRIMARY KEY, value jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS jobs (
  id bigserial PRIMARY KEY,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed','dead')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 4,
  run_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS jobs_pick ON jobs(status, run_at);

CREATE TABLE IF NOT EXISTS rate_limits (key text PRIMARY KEY, count int NOT NULL, window_start timestamptz NOT NULL);
