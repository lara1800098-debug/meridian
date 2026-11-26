#!/usr/bin/env bash
# One-command refresh for a fresh cloud machine (used by the scheduled task):
# start Postgres → restore saved state → crawl all sources → reclassify → export Radar data → save state.
set -euo pipefail
cd "$(dirname "$0")/.."
export NEXT_TELEMETRY_DISABLED=1
export DATABASE_URL="${DATABASE_URL:-postgres://meridian:meridian@localhost:5432/meridian}"
if ! pg_isready -q 2>/dev/null; then
  command -v pg_ctlcluster >/dev/null || (apt-get update -qq && apt-get install -y -qq postgresql >/dev/null)
  pg_ctlcluster "$(ls /etc/postgresql | head -1)" main start
fi
su postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='meridian'\" | grep -q 1 || psql -q -c \"CREATE USER meridian WITH PASSWORD 'meridian' SUPERUSER\""
su postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='meridian'\" | grep -q 1 || psql -q -c 'CREATE DATABASE meridian OWNER meridian'"
[ -d node_modules ] && [ "${SKIP_INSTALL:-0}" = "1" ] || npm ci --no-audit --no-fund
bash scripts/state.sh restore
npm run -s refresh:radar
bash scripts/state.sh save
node -e "const m=require('./radar-app/meta.json');console.log('REFRESH OK',JSON.stringify(m))"
