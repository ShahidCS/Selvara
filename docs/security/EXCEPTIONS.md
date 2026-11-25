# Exceptions register

Every place where the pipeline or the product deliberately falls short of the stricter standard, why, what limits the
risk, who owns it and when it expires. An exception without an owner and a review date does not belong here.
Review the whole register at least quarterly and whenever a "Review when" trigger occurs.

| ID | Exception | Owner | Expires / review |
|---|---|---|---|
| EX-01 | Sole-maintainer review and approval | @ShahidCS | When a second maintainer joins |
| EX-02 | LGPL-3.0 `@img/sharp-*` binaries in the lockfile | @ShahidCS | 2027-05-09 |
| EX-03 | CC-BY-4.0 `caniuse-lite` data | @ShahidCS | 2027-05-09 |
| EX-04 | Known advisories in the pinned Vercel CLI tree | @ShahidCS | 2026-12-18 (picomatch), 2027-02-09 (the rest), and each CLI release |
| EX-05 | CSP `script-src 'unsafe-inline'` | @ShahidCS | Before production traffic |
| EX-06 | Public Sigstore signing disabled | @ShahidCS | Repository visibility decision |
| EX-07 | No GitHub Advanced Security (private repository, current plan) | @ShahidCS | If the repository moves to an organisation with Advanced Security, or becomes public |
| EX-08 | No environment approval gate and no rulesets (private repository, free plan) | @ShahidCS | When the account is upgraded (GitHub Pro or Team), or the repository becomes public |
| EX-09 | No build-provenance or SBOM attestations (user-owned private repository) | @ShahidCS | If the repository becomes public or moves to an organisation whose plan supports attestations |

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
  and produce an SBOM and a checksum for the exact bytes deployed (provenance attestation: see EX-09).
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

**Evidence they are not distributed.** The product does not use `next/image`. The CI step
`check-shipped-artifact.mjs` fails the build if the shipped output (`.next/static`, `.next/server`, `.vercel/output`)
contains sharp or libvips files or references, any `node_modules` directory or native addons (`.node`). Since v0.1.5 the
output also holds one server function, the authentication API (`api/[...path].func`). The check allows only that
reviewed function and applies the same rules to every file its bundle points to (`filePathMap`, which Vercel uploads
with it), refuses secret files (`.env`, `.env.*` except `.env.example`) and requires every bundled package to be MIT,
Apache-2.0, BSD, ISC or 0BSD. Any other function fails the build until it is reviewed. On 2026-11-09 the Vercel build
output was inspected: static files only. On 2026-11-16 the function bundle was inspected: 256 files from next, react,
react-dom, styled-jsx, client-only, `@swc/helpers`, tslib, iceberg-js and `@supabase/*` (MIT, Apache-2.0, 0BSD), with
no native addons, no sharp or libvips and no secrets. On 2026-11-18 (v0.1.7) it was inspected again after adding the Postgres driver: 374 files, adding `pg` and its helpers
(pg-pool, pg-protocol, pg-types, pg-connection-string, pg-int8, pg-cloudflare, pgpass, postgres-array, postgres-bytea, postgres-date,
postgres-interval, split2, xtend; MIT or ISC), still no native addons (the optional `pg-native` is not installed).

**What still needs doing (owner action).** Nothing while the check passes (sharp is not in the function bundle). **Before** you ever (a) ship a
server or container image that includes sharp or all of `node_modules`, (b) enable `next/image` optimisation, or (c) hand the built artefact to a
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
no Critical remain and 11 High remain (listed in `.github/vercel-cli/audit-baseline.json`). The 11th, `picomatch`
GHSA-fc5q-39xc-vjpf (ReDoS, added 2026-11-18), has no patched release at all; it is accepted for 30 days only, until
2026-12-18, and is to be replaced by an override as soon as a fix ships.

**Why acceptable.** The CLI runs on an ephemeral runner, only on our own build output, never serves traffic and never
handles user input. The remaining issues are mostly denial of service and path handling in build tooling.

**Controls.** Isolated lockfile install, `--ignore-scripts`; the deploy token reaches only the single deploy step, not
the build or third-party actions; the required check "Deploy tooling audit" fails on any High or Critical that is not
in the baseline or whose baseline entry has expired, so a **new** advisory blocks merges; Dependabot and the weekly
scheduled scan keep watching.

**Exit.** Update the CLI when Vercel releases a version without these pins (remove baseline entries as they clear), or
replace the CLI with a direct call to Vercel's REST deployment API (a small script with no dependency tree). The REST
route has not been built or tested; it is an option if the baseline keeps growing.

**Re-assessed 2026-11-24 (owner agreed to keep EX-04).**
- *CLI upgrade.* The newest CLI (66.6.0) and the newest past the 7-day cooldown (65.17.0) report the same 11 High
  findings as 65.12.1: Vercel's builders still pin `undici` 5.28.4, `zod` 3.22.4 and `@fastify/busboy` 2.x. An upgrade
  clears nothing, so the CLI stays on 65.12.1.
- *Replacing the CLI.* The deploy step alone is not enough, because most findings sit in what `vercel build` installs.
  The only CLI-free build found is the Vercel adapter for Next.js. Vercel's own builder enables it only behind an
  opt-in flag, and the standalone package is a beta. Its output differs from `vercel build`: two extra server functions
  (`404`, `_error`), and a different routing table and API function layout. The shipped-artefact check rejects it.
  Security headers were kept, since they come from `next.config.js`. Whether the public REST API supports prebuilt
  output could not be confirmed. Swapping a supported tool for an experimental build and an unverified client was
  judged riskier than the accepted, unreachable findings.
- *Revisit* when the adapter is stable, or when Dependabot offers a CLI release that drops these pins. The `picomatch`
  entry expires on 2026-12-18; the rest are due for review on 2027-02-09.

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

## EX-07 No GitHub Advanced Security

**What.** On a private repository, GitHub's code scanning, dependency review and the Security tab need Advanced Security,
which this plan does not include (owner decision 2026-11-09: stay private, work without it). Three checks were
reworked so they read the scanners' own output instead:

| Check | Normal (Advanced Security) | Here |
|---|---|---|
| CodeQL | Uploads to the Security tab; ruleset blocks High alerts | Same analysis, results written to SARIF; `check-sarif.mjs` fails the job on any High or Critical (CodeQL security-severity 7.0 or higher); SARIF kept 30 days as an artefact |
| Dependency review | Diffs the pull request against the dependency graph | `npm audit` of the runtime lockfile, High and above block; copyleft licences are blocked by the licence policy |
| OSV scan | Uploads to the Security tab | Report kept 30 days as an artefact; informational |

**What is lost.** The Security tab and alert history; automatic alert dismissal and triage; the diff view of newly
introduced vulnerable dependencies (the audit now reports the whole tree rather than only what a pull request adds);
the ruleset's code-scanning rule (replaced by CodeQL being a required status check); GitHub's native secret
scanning of the repository and push protection, which are also Advanced Security features for private repositories
(Gitleaks over the full history remains).

**Compensating controls.** CodeQL, `npm audit`, Trivy, Gitleaks and ZAP all still block on High and Critical, in CI,
before merge and again before every deployment. Findings can be read in the run summary and artefacts.

**Exit.** Set the repository variable `CODE_SCANNING_ENABLED=true` once Advanced Security is available; CodeQL and OSV then
also upload to the Security tab (no workflow change needed), and the code-scanning rule can be added back to
`.github/rulesets/main.json`.

## EX-08 No environment approval gate and no rulesets on the free plan

**What.** On a private repository on the free plan, GitHub refuses (a) required reviewers, wait timers and
deployment-branch rules on environments (HTTP 422) and (b) repository rulesets, and classic branch protection is
also unavailable. `apply-settings.sh` therefore creates the `staging` and `production` environments **without**
those rules and prints what was not applied. Environments still scope the secrets and variables per environment.

**What is lost.**
- No second look before a production deploy: the pause-and-approve step does not exist.
- `main` is not protected by GitHub: nothing technical stops a direct push, a force push, an unsigned commit or
  a merge without review. The required status checks are not enforced as merge conditions either.
- Release tags (`v*`) are not immutable.

**Compensating controls (still in place).**
- Production deploys run only from a `v*.*.*` tag push, and `verify-tag.sh` fails unless the tag is annotated,
  carries a signature GitHub verifies, points at a commit on `main` and matches `package.json`.
- Both deploy workflows run the full CI and security gates first and cannot deploy if any fails.
- Only the owner has write access (sole maintainer); the Vercel token is scoped per environment, used in one step.
- The checksum, the SBOM and the run log tie every deploy to the commit and the run (signed attestations: see EX-09).
- Working practice until the plan changes: open a pull request for every change, wait for all 11 checks to be green,
  merge with Squash and merge in the web UI, never push to `main` directly, and check the Actions tab before tagging.

**Exit.** GitHub Pro (personal account) or Team (organisation) enables rulesets and environment protection rules on
private repositories (confirm on GitHub's pricing page; Advanced Security from EX-07 is a separate product). Then
re-run `.github/scripts/apply-settings.sh --apply`, which is safe to repeat. Making the repository public also enables
all of them. **Do not onboard regulated customers on this configuration**: it cannot show an auditor enforced
branch protection or a production approval.

**Status 2026-11-25.** The repository is now public, so the exit condition is met. Applied by the owner the same day
and read back through the API: `main-protection` and `release-tags` are active (with `staging-protection`, three
rulesets). The owner also set a required reviewer and a `v*.*.*` tag rule on the `production` environment; that is
confirmed when the next release pauses for approval. Close this exception (and its row in the table) after that
release. The compensating controls above stay in place regardless.

## EX-09 No build-provenance or SBOM attestations

**What.** GitHub's artifact attestations (build provenance and SBOM) are refused for user-owned private repositories:
"Feature not available for user-owned private repositories. To enable this feature, please make this repository
public." (first seen in Deploy staging run 4, 2026-11-09). The repository variable `ATTESTATIONS_ENABLED=false` turns
the two attestation steps off, so the pipeline runs without them.

**What is lost.** A signed statement, verifiable by a third party with `gh attestation verify`, that a given archive was
built by this repository's workflow from a given commit. Without it, a recipient must trust the run log and the checksum.

**Compensating controls (still in place).**
- The archive is deterministic (sorted, zero-timestamp); its SHA-256 is computed at build, recorded, and verified again
  immediately before the deploy step extracts and deploys exactly those bytes.
- A CycloneDX SBOM, the checksum and the archive are kept as a run artifact for 90 days, named by commit or tag.
- The build runs with no secrets; the Vercel token is read only by the credential check (boolean) and the deploy step.
- Production releases come only from a signed, annotated tag on `main` that `verify-tag.sh` checks.

**Exit.** Make the repository public, or move it to an organisation on a plan that supports attestations, then delete the
variable `ATTESTATIONS_ENABLED` (the steps default to on). Run `gh attestation verify` on the next release to confirm.
**Do not describe releases as having verifiable provenance to customers while this exception is open.**
