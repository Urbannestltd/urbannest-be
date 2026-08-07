#!/usr/bin/env bash
# Push current branch to the personal (don2dusk) repo's main branch, tuned for Vercel Hobby (free) plan.
# Cron jobs on Hobby are limited to once/day, so vercel.json's crons are set to daily before pushing.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
VERCEL_JSON="vercel.json"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree not clean. Commit or stash your changes first." >&2
  git status --short
  exit 1
fi

echo "==> Setting vercel.json crons to daily (Hobby plan limit)"
tmp="$(mktemp)"
python3 - "$VERCEL_JSON" > "$tmp" <<'PY'
import json, sys
path = sys.argv[1]
with open(path) as f:
    data = json.load(f)
for cron in data.get("crons", []):
    cron["schedule"] = "0 0 * * *"
json.dump(data, sys.stdout, indent=2)
sys.stdout.write("\n")
PY
mv "$tmp" "$VERCEL_JSON"

if [[ -n "$(git status --porcelain -- "$VERCEL_JSON")" ]]; then
  git add "$VERCEL_JSON"
  git commit -m "chore: set cron schedules to daily for dev (Vercel Hobby plan)"
else
  echo "vercel.json already daily, nothing to commit."
fi

echo "==> Pushing $BRANCH to dev/main"
git push dev "$BRANCH":main

echo "Done. Deployed to don2dusk/urbannest-be (Vercel Hobby)."
