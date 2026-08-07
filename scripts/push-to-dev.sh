#!/usr/bin/env bash
# Push current branch to the dev repo's main branch (Urbannestltd/urbannest-be, formerly
# don2dusk/urbannest-be), tuned for Vercel Hobby (free) plan.
# Cron jobs on Hobby are limited to once/day, so vercel.json's crons are set to daily before pushing.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

BRANCH="$(git symbolic-ref --short HEAD)"
VERCEL_JSON="vercel.json"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree not clean. Commit or stash your changes first." >&2
  git status --short
  exit 1
fi

echo "==> Fetching dev"
git fetch dev

if ! git merge-base --is-ancestor dev/main HEAD; then
  echo "==> dev/main has commits not in $BRANCH, merging"
  if ! git merge dev/main --no-edit; then
    CONFLICTS="$(git diff --name-only --diff-filter=U)"
    if [[ "$CONFLICTS" == "$VERCEL_JSON" ]]; then
      echo "==> Auto-resolving vercel.json conflict (cron schedule gets normalized next anyway)"
      git checkout --theirs "$VERCEL_JSON"
      git add "$VERCEL_JSON"
      git commit --no-edit
    else
      echo "Merge conflict in files other than vercel.json - resolve manually:" >&2
      echo "$CONFLICTS" >&2
      exit 1
    fi
  fi
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

echo "Done. Deployed to Urbannestltd/urbannest-be (Vercel Hobby)."
