#!/usr/bin/env bash
# Post-deploy smoke test: the deployed site must serve the security headers that next.config.js defines.
# usage: smoke-headers.sh <base-url>     optional env: VERCEL_AUTOMATION_BYPASS_SECRET (for protected previews)
# Fails closed: an unreachable, redirecting, or protected (401/403) deployment is a failure, not a skip.
set -euo pipefail
base="${1:?base url required}"
# https only. The single exception is http://localhost:<port> when SMOKE_ALLOW_LOCALHOST=1, for testing this script
# on a developer machine; no workflow sets that flag.
if ! [[ $base =~ ^https://[A-Za-z0-9.-]+$ ]]; then
  if [[ ${SMOKE_ALLOW_LOCALHOST:-} == 1 && $base =~ ^http://localhost:[0-9]+$ ]]; then :; else
    echo "refusing to test non-https or malformed URL: $base" >&2; exit 2; fi
fi
hdr=()
[[ -n ${VERCEL_AUTOMATION_BYPASS_SECRET:-} ]] && hdr=(-H "x-vercel-protection-bypass: ${VERCEL_AUTOMATION_BYPASS_SECRET}")
fail=0
check() { # path expected-status
  local path=$1 want=$2 out code
  out=$(curl -sS -o /dev/null -D - --max-time 30 --retry 3 --retry-delay 5 "${hdr[@]}" "$base$path") || { echo "FAIL $path unreachable"; fail=1; return; }
  code=$(echo "$out" | head -1 | awk '{print $2}')
  [[ $code == "$want" ]] && echo "ok   $path -> $code" || { echo "FAIL $path -> $code (want $want). 401/403 means deployment protection blocks the check: set VERCEL_AUTOMATION_BYPASS_SECRET."; fail=1; return; }
  [[ $path == "/ws/overview" ]] || return 0
  local lc; lc=$(echo "$out" | tr -d '\r' | tr 'A-Z' 'a-z')
  has() { echo "$lc" | grep -qE "^$1"; }
  has "content-security-policy:" && echo "$lc" | grep -q "frame-ancestors 'none'" && ! echo "$lc" | grep -q "unsafe-eval" && ! echo "$lc" | grep -qE "script-src[^;]*'unsafe-inline'" && echo "ok   CSP present, frame-ancestors 'none', no unsafe-eval, no inline scripts" || { echo "FAIL CSP missing or weak"; fail=1; }
  has "x-content-type-options: nosniff"        && echo "ok   nosniff"                  || { echo "FAIL x-content-type-options"; fail=1; }
  has "x-frame-options: deny"                  && echo "ok   x-frame-options DENY"    || { echo "FAIL x-frame-options"; fail=1; }
  has "referrer-policy: strict-origin-when-cross-origin" && echo "ok   referrer-policy" || { echo "FAIL referrer-policy"; fail=1; }
  has "permissions-policy:"                    && echo "ok   permissions-policy"      || { echo "FAIL permissions-policy"; fail=1; }
  has "cross-origin-opener-policy: same-origin" && echo "ok   COOP"                    || { echo "FAIL cross-origin-opener-policy"; fail=1; }
  has "strict-transport-security:"             && echo "ok   HSTS"                    || { echo "FAIL strict-transport-security"; fail=1; }
  has "x-powered-by:"                          && { echo "FAIL x-powered-by is exposed"; fail=1; } || echo "ok   no x-powered-by"
}
check /ws/overview 200
check /vendor-portal 200
check /favicon.svg 200
exit $fail
