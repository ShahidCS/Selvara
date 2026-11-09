#!/usr/bin/env bash
# Release gate: the pushed tag must be (1) a plain vMAJOR.MINOR.PATCH, (2) an ANNOTATED tag whose signature GitHub
# reports as verified, (3) on a commit that is part of main, and (4) equal to the version in front-end/package.json.
# env: TAG, REPO, GH_TOKEN. Run from the repository root with full history (fetch-depth: 0).
set -euo pipefail
: "${TAG:?}" "${REPO:?}"
[[ $TAG =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "tag '$TAG' is not vMAJOR.MINOR.PATCH" >&2; exit 1; }

type=$(gh api "repos/$REPO/git/ref/tags/$TAG" --jq '.object.type')
[[ $type == tag ]] || { echo "'$TAG' is a lightweight tag. Releases require an annotated, signed tag (git tag -s)." >&2; exit 1; }
sha=$(gh api "repos/$REPO/git/ref/tags/$TAG" --jq '.object.sha')
verified=$(gh api "repos/$REPO/git/tags/$sha" --jq '.verification.verified')
reason=$(gh api "repos/$REPO/git/tags/$sha" --jq '.verification.reason')
[[ $verified == true ]] || { echo "tag signature is not verified by GitHub (reason: $reason)" >&2; exit 1; }
echo "ok   signed annotated tag ($reason)"

git fetch --no-tags origin main:refs/remotes/origin/main >/dev/null 2>&1 || true
commit=$(git rev-list -n1 "refs/tags/$TAG")
git merge-base --is-ancestor "$commit" refs/remotes/origin/main || { echo "tagged commit $commit is not on main" >&2; exit 1; }
echo "ok   tagged commit is on main"

want=${TAG#v}
have=$(node -p "require('./front-end/package.json').version")
[[ $want == "$have" ]] || { echo "tag version $want does not match front-end/package.json version $have" >&2; exit 1; }
echo "ok   version matches package.json ($have)"
