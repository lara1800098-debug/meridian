# Keeping Meridian Radar up to date automatically

Repository: https://github.com/lara1800098-debug/meridian (private). Scheduled task: "Meridian Radar daily refresh", every day 05:41 Asia/Dubai.

The hosted page (https://claude.ai/artifact/5PbX1tMh82PCT5eHkR7UnA) is refreshed by a **scheduled task** that starts a fresh cloud session with this repository and runs one command:

```bash
bash scripts/cloud-refresh.sh
```

It starts Postgres, restores `data/state.sql.gz` (articles, signals, logos and plays — no users or secrets), crawls all enabled sources, reclassifies, exports `radar-app/*.json`, and saves the state again. Play IDs stay stable, so the team's accept/dismiss decisions and pipeline (kept in the page's own database) survive every refresh.

## Scheduled task prompt (fresh session each run, this repository attached)

> In the meridian repository: run `bash scripts/cloud-refresh.sh` and confirm it prints `REFRESH OK`.
> Commit `radar-app/*.json` and `data/state.sql.gz` with the message "Radar refresh <UTC date>" and push to the default branch.
> Then, with the Artifact tool, read https://claude.ai/artifact/5PbX1tMh82PCT5eHkR7UnA and publish `radar-app/index.html` to that same url with files plays.json, logos.json, trends.json and meta.json from `radar-app/`. Do not change capabilities.
> Reply with the counts from meta.json (articles, plays, logos, qualifying) and any source that reported an error.

Default schedule: daily at 05:41 Asia/Dubai (before the working day), plus on demand ("refresh Meridian now").
