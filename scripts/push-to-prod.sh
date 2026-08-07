#!/usr/bin/env bash
# Merge the current branch into deploy-to-prod, restore the every-minute cron schedule
# (Vercel Pro plan has no cron restriction), commit as the KCT identity, and force-push
# to KCT's repo so Vercel Pro picks it up.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

SOURCE_BRANCH="$(git symbolic-ref --short HEAD)"
SOURCE_REF="refs/heads/$SOURCE_BRANCH"
DEPLOY_BRANCH="deploy-to-prod"
VERCEL_JSON="vercel.json"
KCT_NAME="KCT Consulting"
KCT_EMAIL="kctconsultingltd@gmail.com"

if [[ "$SOURCE_BRANCH" == "$DEPLOY_BRANCH" ]]; then
  echo "You're already on $DEPLOY_BRANCH. Switch to the branch you want to release first." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree not clean. Commit or stash your changes first." >&2
  git status --short
  exit 1
fi

echo "==> Checking out $DEPLOY_BRANCH"
git checkout "$DEPLOY_BRANCH"

echo "==> Merging $SOURCE_BRANCH into $DEPLOY_BRANCH"
if ! GIT_AUTHOR_NAME="$KCT_NAME" GIT_AUTHOR_EMAIL="$KCT_EMAIL" \
     GIT_COMMITTER_NAME="$KCT_NAME" GIT_COMMITTER_EMAIL="$KCT_EMAIL" \
     git merge --no-edit "$SOURCE_REF"; then
  CONFLICTS="$(git diff --name-only --diff-filter=U)"
  if [[ "$CONFLICTS" == "$VERCEL_JSON" ]]; then
    echo "==> Auto-resolving vercel.json conflict (cron schedule gets restored to every-minute next anyway)"
    git checkout --ours "$VERCEL_JSON"
    git add "$VERCEL_JSON"
    GIT_AUTHOR_NAME="$KCT_NAME" GIT_AUTHOR_EMAIL="$KCT_EMAIL" \
    GIT_COMMITTER_NAME="$KCT_NAME" GIT_COMMITTER_EMAIL="$KCT_EMAIL" \
      git commit --no-edit
  else
    echo "Merge conflict in files other than vercel.json - resolve manually:" >&2
    echo "$CONFLICTS" >&2
    exit 1
  fi
fi

echo "==> Restoring every-minute cron schedule (Vercel Pro plan)"
tmp="$(mktemp)"
python3 - "$VERCEL_JSON" > "$tmp" <<'PY'
import json, sys
path = sys.argv[1]
with open(path) as f:
    data = json.load(f)
for cron in data.get("crons", []):
    cron["schedule"] = "* * * * *"
json.dump(data, sys.stdout, indent=2)
sys.stdout.write("\n")
PY
mv "$tmp" "$VERCEL_JSON"

if [[ -n "$(git status --porcelain -- "$VERCEL_JSON")" ]]; then
  git add "$VERCEL_JSON"
  GIT_AUTHOR_NAME="$KCT_NAME" GIT_AUTHOR_EMAIL="$KCT_EMAIL" \
  GIT_COMMITTER_NAME="$KCT_NAME" GIT_COMMITTER_EMAIL="$KCT_EMAIL" \
    git commit -m "chore: restore every-minute cron schedule for prod (Vercel Pro plan)"
else
  echo "vercel.json already every-minute, nothing to commit."
fi

echo "==> Force-pushing $DEPLOY_BRANCH to prod/main"
git push prod "$DEPLOY_BRANCH":main --force

echo "==> Switching back to $SOURCE_BRANCH"
git checkout -

echo "Done. Deployed to kctconsultingltd/urbannest-be (Vercel Pro)."
