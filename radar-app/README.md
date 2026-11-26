# Meridian Radar (hosted team page)

A zero-install version of Meridian for the sales team, published as a claude.ai page.

- `index.html` — the page.
- `plays.json` — the plays from the last live sweep, exported from the Meridian server.
- `offers.json` — the offer catalogue.
- `meta.json` — sweep date and counts.

Shared state lives in the page's database:
- `plays/{id}` — accept / snooze / dismiss decisions.
- `deals` — the pipeline.
- `settings/main` — the quarter target.

To refresh the plays, run `npm run ingest:once` on the Meridian server, re-export `plays.json` (see the `psql` export in the project history), then republish the page with the new file.
