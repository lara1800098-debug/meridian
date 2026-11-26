# Meridian · MET Revenue Intelligence

**Concentrix MET (UAE pilot) — new-business intelligence.** Meridian reads the public web in Arabic and English for buying signals, turns them into scored, source-backed **plays** with bilingual outreach drafts, and keeps the **new-business pipeline honest** with health checks, a realistic forecast, coverage vs target, and a Monday Brief for leaders.

> Scope: new logos and new-business pipeline only. No existing-client management, renewals or upsell. Fully standalone — no CRM, SSO, email, Slack/Teams or any Concentrix internal system. Data comes in through Meridian's own web reading, user entry and file upload; it leaves only through user-initiated downloads (PDF, Excel, CSV).

---

## Quick start (local, one command with Docker)

```bash
cp .env.example .env
```

Set `APP_SECRET` in `.env` to a random 64-character string (`openssl rand -hex 32`) and, optionally, `ANTHROPIC_API_KEY`.

```bash
docker compose up -d --build
```

```bash
docker compose run --rm migrate npm run db:seed -- --demo
```

Open http://localhost:3000. The seed prints the admin login, the demo users and a **TOTP key for each** — add the key to Microsoft/Google Authenticator (MFA is mandatory for everyone).

Without `--demo` the seed creates only the first Admin; invite everyone else from **Admin → Users** (Meridian shows the invite link; it sends no email).

### Without Docker (developer setup)

Requires Node 22+, PostgreSQL 16 (with the `pg_trgm` and `pgcrypto` extensions — included in standard packages).

```bash
npm ci
```

```bash
npm run db:migrate && npm run db:seed -- --demo
```

```bash
npm run build && npm start
```

In a second terminal (background jobs: crawling, scoring, Monday Briefs):

```bash
npm run worker
```

If outbound traffic must go through a corporate proxy, set `HTTPS_PROXY`; Meridian's crawler and AI client will use it.

---

## Demo mode

`npm run db:seed -- --demo` loads a **fictional** dataset — 12 organisations, people, signals, plays, deals, targets and briefs, all flagged `is_demo` and shown with a **DEMO DATA** tag and a banner (`DEMO_MODE=1`). No real company or person appears in demo signals. Demo mode works without an AI key: classification uses the bilingual rules engine and outreach/briefs use templates.

Demo logins (password `Demo-Meridian-2026!`, each with its own TOTP key printed by the seed):

| Role | Email |
|---|---|
| Executive | ceo.demo@meridian.local |
| Sales Director UAE | director.uae.demo@meridian.local |
| AE (Government) — Arabic UI | ae1.demo@meridian.local |
| AE (Private sector) | ae2.demo@meridian.local |
| BDR | bdr.demo@meridian.local |
| Sales Director KSA (Sun–Thu week, Arabic) | director.ksa.demo@meridian.local |

---

## What's in the box

| Module | Where |
|---|---|
| Signal Engine — source registry, polite crawler (robots.txt, rate limits, clear UA), Arabic/English, de-duplication, entity resolution, classification, paste-URL/upload | `/signals`, Admin → Sources, `src/lib/ingest`, `src/lib/engine/classify.ts` |
| Organisation dossiers, public-role people, private notes, AR/EN typo-tolerant search | `/orgs`, `/search` |
| Explainable scoring — Fit/Intent/Timing/Access + reasons (EN/AR), confidence, tiers, calibration | `src/lib/engine/score.ts`, Admin → Scoring / Calibration |
| Plays — why-now with source citations, offers, proof point, value range, risks, bilingual outreach, accept→deal | `/plays` |
| Tender Reader — upload RFP (PDF/DOCX), extraction with verbatim citations, Go/No-Go, attach to deal | `/tenders` |
| Access Map — relationships, best path in, who-calls-whom | `/access` |
| Quick Sizer — Erlang C + shrinkage → FTE/seats → value via rate cards | `/sizer` |
| Pipeline Health — deal register, 60-second quick update, Excel/CSV import wizard & export, history, reality-check engine, next best action | `/deals` |
| Forecast — owner commit, weighted, Meridian realistic (method shown), coverage, concentration, funnel, velocity, win/loss | `/forecast` |
| Cockpit & Monday Brief (work-week + timezone aware, PDF), Deal Review pack (PDF), Meeting brief (PDF), Event planner | `/`, `/brief`, `/review`, `/orgs/:id/brief`, `/events` |
| Admin — users/roles/territories, sources, weights, offers, stages, FX, rate cards, competitors, AI models & budget, monitoring, audit, privacy deletion | `/admin` |

---

## Configuration (`.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `APP_SECRET` | ≥32 chars; signs sessions and encrypts TOTP seeds (AES-256-GCM) |
| `ANTHROPIC_API_KEY` | Optional. Enables AI classification refinement, translation, outreach, brief summaries, tender extraction. Without it Meridian runs on rules + templates. |
| `APP_URL` | Public URL (used in invite links) |
| `DEMO_MODE` | `1` shows the demo banner |
| `UPLOAD_DIR` | Private storage for uploaded documents (outside the web root) |
| `CRAWLER_CONTACT` | Text in the crawler's User-Agent (generic by default) |
| `HTTPS_PROXY` | Optional corporate proxy |

AI models per task, the daily AI budget (USD) and on/off switch are in **Admin → AI usage & settings**. Defaults: `claude-haiku-5-5` for bulk classification/translation, `claude-opus-5-5` for outreach, briefs, tender extraction and next best action.

---

## Hosting in-region (UAE)

Meridian is a standard Docker Compose stack (web, worker, PostgreSQL), so it runs on any single VM.

1. **Region.** Use a UAE region:
   - Microsoft Azure — UAE North (Dubai) or UAE Central (Abu Dhabi).
   - Oracle Cloud — Dubai or Abu Dhabi.
   - AWS — me-central-1 (UAE).
   - G42/Core42 sovereign cloud.

   Choose the provider your InfoSec team has approved.
2. **VM size.** A 4 vCPU / 16 GB RAM VM is ample for the pilot. Use an encrypted managed disk (encryption at rest), or managed PostgreSQL with encryption at rest and point-in-time restore.
3. **TLS.** Put HTTPS in front with Caddy, nginx + Let's Encrypt, or the cloud load balancer, then set `APP_URL=https://…`. Secure session cookies are enabled automatically on HTTPS.
4. **Network.** Restrict inbound to 443, from the corporate network or VPN if required. Outbound needs only the enabled source hosts plus `api.anthropic.com`. Run `npm run verify:egress` to print the exact list for your firewall allowlist.
5. **Backups.** Schedule `npm run backup` daily with cron. It runs `pg_dump` and archives the uploads, keeping 30 days. Copy backups to a second UAE-region storage account; the script includes an optional `gpg` encryption line.
6. **AI and data residency.** Check with CNX InfoSec where LLM inference may run. Requests contain public news text and pipeline metadata only; uploaded tenders are sent to the LLM only when an API key is set. Set `aiEnabled` off in Admin to keep everything on the VM.

### Restore

```bash
gunzip -c backups/meridian-YYYYMMDD-HHMM.sql.gz | psql "$DATABASE_URL"
```

```bash
tar xzf backups/uploads-YYYYMMDD-HHMM.tgz
```

---

## Tests and quality checks

```bash
npm test
```
Unit tests (49) cover the scoring, classifier (AR/EN), health rules, forecast maths, Erlang C sizer, robots.txt, de-duplication, work-week brief timing calibration and tender extraction.

```bash
npm run e2e
```
End-to-end journeys (7, Playwright) against a running app with demo data: MFA login, cockpit, brief PDF, accept-a-play, quick update, Arabic RTL, RBAC, Excel import and phone layout.

```bash
npm run eval
```
The classification evaluation set (`eval/signals.jsonl`). Run it after any rule, prompt or model change; add `--ai` to also score the AI classifier.

```bash
npm run verify:egress
```
Lists every outbound destination and scans the code for unexpected network calls.

Prompts are versioned files in `/prompts` (`name.vN.md`).

---

## Operations

- **Monitoring:** Admin → Monitoring shows jobs, dead-letter queue (retry), source health, AI usage. `GET /api/health` for uptime checks.
- **Ingestion:** the worker schedules each enabled source by its frequency. `npm run ingest:once` crawls everything once (useful after setup).
- **Retention:** `npm run retention -- --days 730` removes old crawled data not linked to deals or accepted plays.
- **Privacy:** Admin → Privacy deletes a person's records on request (UAE PDPL / KSA PDPL); every deletion is audited.

---

## How Meridian differs from existing Concentrix tools

Concentrix already sells revenue and CX products to **clients**:
- **B2B/B2C sales outsourcing**, including the proprietary *Lead Factory* prospect-data engine.
- **iX Hello** (customer-facing AI assistants).
- **iX Hero** (advisor desktop AI).
- **Decision Intelligence** services.

These were checked on concentrix.com on 26 Nov 2026. Existing internal EMEA sales tools each cover one step and are mostly Europe-focused. Meridian does not duplicate any of them. It is an **internal** tool for Concentrix MET's own new-business team:

1. **Built for MET.** It reads Arabic and English, and government and GCC-specific signals: tenders, regulation, Emiratisation, regional HQs and service ratings.
2. **Finds leads before they become RFPs**, not only after.
3. **Covers the whole journey in one place:** signal → play → deal → health → forecast.
4. **Pipeline health and an honest forecast are built in.**
5. **Designed for the C-suite and Sales Directors:** few, source-backed insights, delivered as a Monday Brief and a cockpit.
6. **Fully standalone.** No integrations, and Concentrix owns all the data.

Meridian *recommends* Concentrix's own offers (iX Hello, iX Hero, managed contact centre, CX strategy and others) in every play. It sells them; it doesn't rebuild them.

See `DECISIONS.md` for design decisions and `docs/` for the admin and user guides (EN/AR).
