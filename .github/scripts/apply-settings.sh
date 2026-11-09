#!/usr/bin/env bash
# Applies the repository settings that the pipeline depends on, through the GitHub API (gh CLI).
# It needs a token with repository ADMIN rights, so it is run by a human, never by CI.
#
#   .github/scripts/apply-settings.sh                 dry run: prints every API call, changes nothing
#   .github/scripts/apply-settings.sh --apply         applies the settings
#
# Environment:  REPO=owner/name (default ShahidCS/Selvara)   PROD_REVIEWER_ID=<numeric GitHub user id> (default 23242010)
#               WAIT_MINUTES=<production wait timer, default 10>
# Idempotent: rulesets are matched by name and updated, environments are PUT. Review the dry run first.
set -euo pipefail
cd "$(dirname "$0")/../.."
REPO=${REPO:-ShahidCS/Selvara}
PROD_REVIEWER_ID=${PROD_REVIEWER_ID:-23242010}
WAIT_MINUTES=${WAIT_MINUTES:-10}
APPLY=0; [[ ${1:-} == --apply ]] && APPLY=1
command -v gh >/dev/null || { echo "gh CLI is required" >&2; exit 1; }

api() { # method path [json-body]
  local method=$1 path=$2 body=${3:-}
  if [[ $APPLY == 1 ]]; then
    if [[ -n $body ]]; then printf '%s' "$body" | gh api -X "$method" "$path" --input - >/dev/null && echo "applied  $method $path"
    else gh api -X "$method" "$path" >/dev/null && echo "applied  $method $path"; fi
  else
    echo "dry-run  $method $path"; [[ -n $body ]] && echo "$body" | head -c 400 | sed 's/^/           /' && echo
  fi
}

echo "== Repository: $REPO  mode: $([[ $APPLY == 1 ]] && echo APPLY || echo DRY-RUN)"

echo; echo "== 1. Merge policy and security features"
api PATCH "repos/$REPO" '{"allow_squash_merge":true,"allow_merge_commit":false,"allow_rebase_merge":false,"delete_branch_on_merge":true,"allow_auto_merge":false,"security_and_analysis":{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}}'
api PUT "repos/$REPO/vulnerability-alerts"
api PUT "repos/$REPO/automated-security-fixes"

echo; echo "== 2. Actions: read-only default token, only allow-listed actions, SHA pinning required"
api PUT "repos/$REPO/actions/permissions/workflow" '{"default_workflow_permissions":"read","can_approve_pull_request_reviews":false}'
api PUT "repos/$REPO/actions/permissions" '{"enabled":true,"allowed_actions":"selected","sha_pinning_required":true}'
api PUT "repos/$REPO/actions/permissions/selected-actions" '{"github_owned_allowed":true,"verified_allowed":false,"patterns_allowed":["aquasecurity/trivy-action@*","gitleaks/gitleaks-action@*","zaproxy/action-baseline@*","google/osv-scanner-action/*@*","anchore/sbom-action@*","sigstore/cosign-installer@*"]}'

echo; echo "== 3. Environments"
api PUT "repos/$REPO/environments/staging" '{"wait_timer":0,"prevent_self_review":false,"reviewers":[],"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}'
api POST "repos/$REPO/environments/staging/deployment-branch-policies" '{"name":"main","type":"branch"}'
api PUT "repos/$REPO/environments/production" "{\"wait_timer\":$WAIT_MINUTES,\"prevent_self_review\":false,\"reviewers\":[{\"type\":\"User\",\"id\":$PROD_REVIEWER_ID}],\"deployment_branch_policy\":{\"protected_branches\":false,\"custom_branch_policies\":true}}"
api POST "repos/$REPO/environments/production/deployment-branch-policies" '{"name":"v*.*.*","type":"tag"}'

echo; echo "== 4. Rulesets (main protection, release tags)"
for f in .github/rulesets/main.json .github/rulesets/release-tags.json; do
  name=$(node -p "require('./$f').name")
  id=""
  if [[ $APPLY == 1 ]]; then id=$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name==\"$name\") | .id" 2>/dev/null || true); fi
  if [[ -n $id ]]; then api PUT "repos/$REPO/rulesets/$id" "$(cat "$f")"; else api POST "repos/$REPO/rulesets" "$(cat "$f")"; fi
done

cat <<'EOT'

== Manual steps this script cannot do (secrets must never pass through scripts or chat)
  1. Settings > Environments > staging / production > add secret VERCEL_TOKEN (a separate scoped token per environment)
     and variables VERCEL_ORG_ID, VERCEL_PROJECT_ID. Optional: secret VERCEL_AUTOMATION_BYPASS_SECRET, variable STAGING_ALIAS.
  2. In Vercel: set the project Root Directory to front-end, and confirm Git auto-deploy is off (front-end/vercel.json also disables it).
  3. Advanced Security features (code scanning, dependency review, secret scanning) are optional: this repository runs without them (docs/EXCEPTIONS.md EX-07). If the PATCH above reports them as unavailable, that is expected.
  4. Commit signing: every contributor needs a verified signing key (see docs/PIPELINE.md, "Commit signing").
EOT
