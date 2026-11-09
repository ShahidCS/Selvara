# Exceptions register

Every place where the pipeline or the product deliberately falls short of the stricter standard, why, what limits the
risk, who owns it and when it expires. An exception without an owner and a review date does not belong here.
Review the whole register at least quarterly and whenever a "Review when" trigger occurs.

| ID | Exception | Owner | Expires / review |
|---|---|---|---|
| EX-01 | Sole-maintainer review and approval | @ShahidCS | When a second maintainer joins |
| EX-02 | LGPL-3.0 `@img/sharp-*` binaries in the lockfile | @ShahidCS | 2027-05-09 |
| EX-03 | CC-BY-4.0 `caniuse-lite` data | @ShahidCS | 2027-05-09 |
| EX-04 | Known advisories in the pinned Vercel CLI tree | @ShahidCS | 2027-02-09, and each CLI release |
| EX-05 | CSP `script-src 'unsafe-inline'` | @ShahidCS | Before production traffic |
| EX-06 | Public Sigstore signing disabled | @ShahidCS | Repository visibility decision |

## EX-01 Sole-maintainer review and approval

**What.** The repository has one maintainer. The branch ruleset requires an approving review from a code owner other
than the last pusher, which one person cannot satisfy. The repository admin role is therefore a bypass actor, limited to
pull requests, in both rulesets. The `production` environment has the same person as its only reviewer, with
self-review allowed and a ten-minute wait timer.

**Why this is an exception.** It fails a strict segregation-of-duties test (the author can approve their own change and
their own production release). It is accepted because there is nobody else to approve, not because the control is
unimportant.

**Compensating controls (all still enforced).**
- Every change goes through a pull request; direct pushes to `main` are blocked.
- All ten required status checks must pass and be up to date: typecheck, unit tests, build, audit, Playwright, CodeQL,
  secret scan, dependency review, licences, tooling audit, Trivy, ZAP.
- Commits must be signed. No force pushes, no deletion, linear history.
- Production deploys need the environment gate, run only from a signed, verified, annotated release tag on `main`,
  and produce a provenance attestation and SBOM for the exact bytes deployed.
- Each bypass is recorded in the GitHub audit log. The ten-minute timer gives a window to cancel.
- Review the audit log monthly for bypass events: Settings, Audit log, filter `action:protected_branch.policy_override`.

**Exit criteria.** When a second maintainer exists: add them to `.github/CODEOWNERS`; add them as a production
reviewer; set `prevent_self_review` to `true` in `.github/scripts/apply-settings.sh`; remove the bypass actor from
`.github/rulesets/main.json` and `release-tags.json`; re-run `apply-settings.sh --apply`.
**For regulated customers:** require two production approvers before onboarding them; this exception must not be relied
on in an audit of a bank or critical-infrastructure deployment.

## EX-02 LGPL-3.0 `@img/sharp-*`

**What.** Next.js lists the sharp image library's prebuilt libvips binaries as optional dependencies. They are LGPL-3.0
and the policy otherwise denies LGPL.

**Evidence they are not distributed.** The product is a static site with no `next/image` use. The CI step
`check-shipped-artifact.mjs` fails the build if the shipped output (`.next/static`, `.next/server`, `.vercel/output`)
contains sharp or libvips files or references, any `node_modules` directory, native addons (`.node`), or serverless
function bundles. On 2026-11-09 the Vercel build output was inspected: static files only.

**What still needs doing (owner action).** Nothing for a static deployment. **Before** you ever (a) ship a server or
container image that includes `node_modules`, (b) enable `next/image` optimisation, or (c) hand the built artefact to a
customer for self-hosting, get legal sign-off: LGPL-3.0 then requires licence text, source offer and the ability for
the user to replace the library. The simplest remedy is to remove the optional binaries (`npm install --omit=optional`
or `overrides`), which the exception's check makes easy to verify.

## EX-03 CC-BY-4.0 `caniuse-lite`

**What.** Browser-support data under Creative Commons Attribution. Attribution is the only obligation.

**Done.** Attribution is in `THIRD_PARTY_NOTICES.md` (generated and checked in CI so it cannot go stale). The data is
build-time only and is not in the shipped output (same check as EX-02). If the product ever ships a "licences" page,
link `THIRD_PARTY_NOTICES.md` from it.

## EX-04 Known advisories in the Vercel CLI tree

**What.** The pinned Vercel CLI exact-pins vulnerable transitive packages. After targeted same-major overrides,
no Critical remain and 10 High remain (listed in `.github/vercel-cli/audit-baseline.json`).

**Why acceptable.** The CLI runs on an ephemeral runner, only on our own build output, never serves traffic and never
handles user input. The remaining issues are mostly denial of service and path handling in build tooling.

**Controls.** Isolated lockfile install, `--ignore-scripts`; the deploy token reaches only the single deploy step, not
the build or third-party actions; the required check "Deploy tooling audit" fails on any High or Critical that is not
in the baseline or whose baseline entry has expired, so a **new** advisory blocks merges; Dependabot and the weekly
scheduled scan keep watching.

**Exit.** Update the CLI when Vercel releases a version without these pins (remove baseline entries as they clear), or
replace the CLI with a direct call to Vercel's REST deployment API (a small script with no dependency tree). The REST
route has not been built or tested; it is an option if the baseline keeps growing.

## EX-05 CSP `script-src 'unsafe-inline'`

**What.** The Pages Router injects inline bootstrap scripts, so a strict CSP needs per-request nonces, which a fully
static deployment cannot supply. **Controls.** The rest of the CSP is strict (`default-src 'self'`, no `unsafe-eval`,
`frame-ancestors 'none'`, `object-src 'none'`), no user HTML is rendered unescaped, and the smoke test asserts the
header on every deploy. **Exit.** Before production traffic, serve through a runtime with nonce support or hash the
bootstrap scripts.

## EX-06 Public Sigstore signing disabled

**What.** Keyless cosign signing writes the signer identity and repository name to Sigstore's public transparency log.
For a private repository that discloses its existence, so `COSIGN_ENABLED` is off (owner decision, 2026-11-09).
**Compensating evidence.** GitHub artifact attestations (private to the repository where the plan supports them)
and the SHA-256 checksum. **Exit.** Revisit if the repository becomes public or a customer requires a detached signature.
