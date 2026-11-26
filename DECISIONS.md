# Decisions

Each entry: what, why, and what to revisit.

## Scope & approach

1. **Built straight through to a working UAE pilot instead of milestone-by-milestone approval.** The owner asked to "adjust as needed to reach a working tool". All six milestones were built in one pass. Each is covered by tests and a demo journey.
2. **No duplication with Concentrix offerings.** concentrix.com was checked on 26 Nov 2026. It lists client-facing products and services: iX Hello, iX Hero, the iX Product Suite, B2B/B2C sales outsourcing with the *Lead Factory* prospect-data engine, Decision Intelligence and Revenue Growth services. It lists no internal MET signal-to-forecast tool. Two consequences:
   - **Meridian does not do contact enrichment** (no personal emails or phones). That is Lead Factory's space and a PDPL risk.
   - **Meridian's Offer Catalogue points to the real Concentrix service lines** and quotes only public proof points, each with its URL.
3. **UAE first.** The pilot country list is `AE`. MET/GCC countries are still classified, and plays are created for any MET/GCC country, so KSA/EG/JO/TR expansion signals are not lost. Executives can filter by country.

## Stack

4. **Next.js 15 (App Router, server components and server actions) with TypeScript.** One codebase for the UI and the server. Every page and action checks the session and role on the server.
5. **PostgreSQL 16 accessed with `postgres.js` and raw SQL** rather than Prisma or Drizzle. The schema is one readable file (`src/db/schema.sql`) and the queries are explicit, which makes the row-level security filters easy to audit. *Revisit* if the team prefers an ORM.
6. **Background jobs use a Postgres queue (`FOR UPDATE SKIP LOCKED`)** instead of BullMQ + Redis. That is one fewer service to run in-region. It has retries with exponential backoff, a dead-letter state and a retry button in Admin.
7. **Semantic dedup and search use `pg_trgm` (trigram similarity), not `pgvector`.**
   - Anthropic offers no embeddings endpoint, and adding another provider would add an outbound connection.
   - Trigrams handle typos and Arabic well enough for titles and names.
   - "Same story" is detected three ways: an exact hash, a title fingerprint, trigram similarity ≥ 0.55, and finally same organisation + same event type within 14 days.
   - *Revisit:* `pgvector` and an in-region embedding model if recall needs to improve.
8. **PDFs are rendered with headless Chromium from internal `/print/*` pages.** Arabic shaping and RTL come out correct and the PDFs use the same brand tokens as the app. The PDF browser is blocked from every host except the app itself.
9. **Fonts are self-hosted** (IBM Plex Sans / IBM Plex Sans Arabic via `@fontsource`) as placeholders until the CNX brand kit arrives. There are no CDNs, analytics or telemetry, which keeps the "no other outbound connections" rule.

## Data sourcing (legal & ethical)

10. **robots.txt is enforced in code.** A source whose robots.txt forbids the path is **disabled automatically**, with a note. On 26 Nov 2026 this disabled every Google News search feed (`/rss/search` is disallowed), along with MENAbytes and Arabian Business.
11. **Full text is stored only for official/government sources.** For news sites Meridian stores the headline, excerpt, link, fetch time and content hash (copyright and terms). Every claim stays traceable through the stored snapshot and the link.
12. **No logins, paywalls or access-control bypass.** Procurement portals that need a login are handled by the Tender Reader upload. LinkedIn is not read.
13. **Every source starts with `terms_checked = false`.** Eight feeds were verified as reachable with robots.txt permission and are enabled:
    - The National (main + business)
    - Gulf News
    - Arab News
    - Asharq Al-Awsat (EN + AR)
    - Saudi Gazette
    - Wamda

    Their terms of use have **not** been legally reviewed. A human must tick "terms checked" in Admin → Sources before production use.
14. **18 live sources are enabled and verified (26 Nov 2026).**
    - **8 official Abu Dhabi Media Office category feeds**, English and Arabic: economy, government affairs, health, technology and transport.
    - Gulf Today, and the Emirates 24|7 news sitemap. News sitemaps are now supported.
    - The 8 feeds listed in decision 13.

    WAM, Dubai Media Office and u.ae publish no public feed that could be found. They stay seeded as disabled entries until a feed is identified.
    - **Cross-language duplicates:** the same story in English and Arabic (e.g. ADMO publishes both) merges only when the AI translation step is on. Without a key the two versions stay separate signals.

## AI

15. **AI is optional.** Classification (bilingual rules), scoring, plays (template outreach in formal Gulf Arabic and English), health, forecast and briefs all work without an API key, so demo mode needs no key. With a key, AI adds translation, refined classification, tailored outreach, brief summaries, tender extraction and next-best-action.
16. **Grounding is enforced in code, not just in prompts.** An AI classification is rejected unless every organisation name, amount and evidence quote appears verbatim in the source text. Tender fields without a verbatim quote are dropped. Crawled text is wrapped in `<source_document>` tags, and the system prompt says it is data, never instructions (prompt-injection defence).
17. **Models:** `claude-haiku-5-5` for bulk classification and translation; `claude-opus-5-5` for outreach, briefs, tenders and next-best-action. Both are configurable per task in Admin. Server-side refusal fallback is on. Cost controls:
    - a daily USD budget (default $10);
    - a 30-day response cache;
    - a usage log with cost per task.
18. **Prompts are versioned files** (`prompts/*.vN.md`). The evaluation set in `eval/signals.jsonl` is run with `npm run eval` and gates on ≥ 85% (rules currently score 98%: 49/50).

## Scoring defaults (all Admin-editable)

19. **Weights.**

    | Track | Fit | Intent | Timing | Access |
    |---|---|---|---|---|
    | Enterprise/Gov | .30 | .30 | .25 | .15 |
    | SMB | .35 | .25 | .25 | .15 |
    | Competitor | .25 | .35 | .30 | .10 |

    Access is lowest because the Access Map starts empty.
20. **Tiers and thresholds.**
    - Leader-grade ≥ 75; Team-grade ≥ 55; otherwise Watchlist.
    - A play is created at ≥ 55.
    - **Low-confidence items are capped at Team-grade**, so executives only see corroborated or high-quality items.
21. **Confidence** depends on source quality (1–5, set per source) and corroboration:
    - **High:** quality ≥ 4 with 2 or more sources, or 3 or more sources of any quality.
    - **Medium:** quality ≥ 4, or 2 sources.
    - **Low:** otherwise.
22. **Noise rejection.** A news item that matches no buying-signal pattern becomes no signal; the snapshot is still kept. Stories outside MET/GCC (`XX`) never become plays. On the 26 Nov live crawl, about 290 articles produced about 20 signals.
23. **Calibration** fits a logistic regression on accepted versus dismissed plays and proposes normalised weights with an AUC before/after comparison. It needs at least 30 outcomes, and an Admin must approve before anything changes.

## Pipeline & forecast

24. **Realistic forecast** = Σ value × p × health factor × (1 − slippage).
    - Health factors: Healthy 1.0, Watch 0.8, At risk 0.5.
    - p is the stage probability until 10 or more deals have closed; after that it is the historical win rate from that stage, and historical slippage is applied.
    - The method and the per-deal lines are shown on the Forecast page.
25. **Health status.** Each reason has a severity. Any severity-3 reason, or 6 or more points in total, means At risk; 2 or more points means Watch. Low-activity periods (Ramadan, Eid, summer) are informational only. **The 2027 Islamic-calendar dates are approximate**, and an Admin must confirm them each year.
26. **Imports are idempotent by title** (re-importing the same file skips existing open deals). UAE date convention is dd/mm/yyyy.

## Security

27. **Login** uses a local email + password (≥ 12 characters, mixed case, a digit and a symbol, bcrypt cost 12).
    - **Mandatory TOTP MFA**, with seeds stored encrypted (AES-256-GCM).
    - 30-minute idle timeout and a 12-hour absolute limit.
    - Lockout after 5 failed attempts, plus per-IP rate limiting.
    - Auth sits behind an `AuthProvider` interface so SSO can be added later. No SSO is built.
28. **Role-based access is enforced on the server** for every page, action and export route, with row-level filtering:
    - Directors see their countries/sectors and their team.
    - AEs and BDRs see their own deals and the plays in their territory.
    - Access Map entries are visible only to their author, Directors, Executives and Admin.
29. **Uploads** are checked by magic bytes, limited to 20 MB and stored outside the web root with mode 600. Virus scanning hooks into ClamAV if one is available (not bundled). The audit log covers logins, exports, deletions, configuration changes and AI-call metadata.

## Known limitations (not done yet)

- OCR for scanned PDFs runs locally with Tesseract (Arabic + English, installed in the Docker image; nothing leaves the server). Arabic OCR can misread digits and percentages, e.g. "80%" read as "9680". The UI says so, and every extracted field is shown next to its original text.
- The map view of plays by country is a ranked country list (no geo map), to avoid a map tile provider (an outbound connection).
- Docker images were not built in the development container (no Docker engine available). Compose and the Dockerfile are provided, and the app was verified with a native Node + Postgres run.
- The Concentrix logo and brand kit are placeholders until the official files are supplied. Rate cards and targets are placeholders/demo.
