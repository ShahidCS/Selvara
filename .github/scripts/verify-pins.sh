#!/usr/bin/env bash
# Verifies that every `uses: owner/repo[/path]@<sha> # vX.Y.Z` in the workflows pins the commit that the
# upstream tag vX.Y.Z actually points to (peeled for annotated tags). Needs network access to github.com.
# Run it after Dependabot or manual edits, and before trusting a new pin:   .github/scripts/verify-pins.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
fail=0; checked=0
declare -A cache
while IFS= read -r line; do
  file=${line%%:*}; rest=${line#*:}
  # shellcheck disable=SC2001
  ref=$(echo "$rest" | sed -E 's/.*uses:[[:space:]]*([^[:space:]]+).*/\1/')
  tag=$(echo "$rest" | sed -nE 's/.*#[[:space:]]*(v[0-9][^[:space:]]*).*/\1/p')
  case "$ref" in ./*|docker://*) continue;; esac
  repo=$(echo "${ref%@*}" | cut -d/ -f1,2); sha=${ref#*@}
  checked=$((checked+1))
  if [[ ! $sha =~ ^[0-9a-f]{40}$ ]]; then echo "NOT PINNED  $file: $ref"; fail=1; continue; fi
  if [[ -z $tag ]]; then echo "NO TAG NOTE $file: $ref (add '# vX.Y.Z')"; fail=1; continue; fi
  if [[ -z ${cache[$repo]:-} ]]; then cache[$repo]=$(git ls-remote --tags "https://github.com/$repo.git" 2>/dev/null || true); fi
  up=$(echo "${cache[$repo]}" | awk -v t="refs/tags/$tag^{}" '$2==t{print $1}')
  [[ -z $up ]] && up=$(echo "${cache[$repo]}" | awk -v t="refs/tags/$tag" '$2==t{print $1}')
  if [[ -z $up ]]; then echo "TAG NOT FOUND $file: $repo $tag"; fail=1
  elif [[ $up != "$sha" ]]; then echo "MISMATCH    $file: $repo $tag pinned=$sha upstream=$up"; fail=1
  else echo "ok          $repo $tag"; fi
done < <(grep -rnE '^\s*(-\s*)?uses:' .github/workflows | sed -E 's/^([^:]+):[0-9]+:/\1:/')
echo "checked $checked pins"; exit $fail
