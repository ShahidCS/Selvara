# Testing

Two layers, both run in CI on every push and pull request.

| Layer | Tool | Location | Needs a browser |
| --- | --- | --- | --- |
| Unit (pure logic and services, Node environment) | Vitest 5.1.0 | `tests/unit/*.test.ts` | No |
| End to end (built app, real Chromium) | Playwright Test 1.65.0 | `e2e/*.spec.ts` | Yes |

All commands run from `front-end/`.

## Running locally

```bash
npm install
npm test                 # unit tests (vitest run), about 2 seconds
npm run test:watch       # watch mode
npm run typecheck        # tsc --noEmit
npm run ci               # typecheck + unit tests + production build

npx playwright install chromium   # once, if you have no Chromium
npm run test:e2e         # builds, starts the app on :3100, runs all e2e specs
```

Useful e2e variations:

```bash
# reuse a server you already started (skips the build); the config reuses a running :3100 outside CI
npm run build && npx next start -p 3100 &
npx playwright test e2e/rbac.spec.ts
npx playwright test -g "support cannot approve"

# use an existing Chromium binary instead of the Playwright download
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test
```

The Playwright config (`playwright.config.ts`) uses Chromium only, 2 workers, `trace: 'off'`, 1 retry on CI and none locally. A full run takes about 1.5 minutes on 2 workers, excluding the build.

## What the unit tests cover

Unit tests import the real modules through the `@/` alias (see `vitest.config.ts`). Modules that read the acting persona are driven with `appStore.set({ role })`. JSON imports work in Vitest without extra configuration.

| File | Covers |
| --- | --- |
| `security.test.ts` | `safeHref`, `safeFileName`, `validateUpload`, `clampText`, `isEmail`, `isIsoDate`, `logSafeUrl`, and `isSafeWebhookUrl` (http, `javascript:`, localhost, 127/8, 169.254.169.254, 10/8, 172.16/12 edges, 192.168/16, CGNAT, IPv6 literals, decimal/hex/octal hosts, credentials in the URL, internal names, control characters, length) |
| `credentials.test.ts` | `checkPassword`: 12 minimum and 128 maximum, code point counting, Unicode and spaces, no composition rules, common and breached list (including look-alike spellings), name/email/company, repeats and sequences, NFKC |
| `sod.test.ts` | `personKey`, `isSamePerson`, `baseRole`, `hasRole`, `getActor`, `assertNotSelf`, `sodReason`, `assertRole`, and the SoD constants |
| `approvals.test.ts` | Four-eyes engine: requester cannot approve, role gate, forbid list, `needs=2` with two different approvers, withdraw only by the requester, rejection, expiry with a fake clock |
| `riskBoard.test.ts` | Board evidence validators (reference format, date not in the future, at most 90 days old, approving body, minutes file gate), acceptance expiry (at most 12 months), and `acceptRisk` at the threshold: residual 15 accepted through the authority ladder, residual 16 needs Board evidence and a second verifier |
| `frameworks.test.ts` | `reqStatus` derivation (Met, Partially met, Not met, Not assessed, Not applicable), `fwScore`, `fwReadiness`, `fwBand` |
| `elevation.test.ts` | Elevated session: only `super` can start, reason / ticket / duration limits, live up to the last millisecond and not at the deadline, `expireIfDue` drops an elapsed session once and logs once, `assertElevated` refuses after expiry with no timer, an expired session is replaced by one counted from the new start, ending early is idempotent, a role switch or the other super admin never inherits it (fake timers) |
| `format.test.ts` | `csvCell` formula-injection guard, `esc`, money and number formatting |

## What the e2e tests cover

| Spec | Covers |
| --- | --- |
| `routes.spec.ts` | Every route in `nav.json`, plus `/admin/billing/cust-101`, `/ws/audits/AUD-01`, `/auth`, `/vendor-portal`, renders for an allowed role with a heading, no console errors and no dialogs |
| `rbac.spec.ts` | Role by route matrix generated from `roles.json` and `nav.json`: allowed routes stay, denied routes redirect, for all 12 personas |
| `privileged.spec.ts` | Super admin lands on `/admin/customers` and has no `/ws` access; admin mutation controls stay locked until elevation (reason of at least 15 characters, ticket `OPS-1234`, then "Simulate key touch"); a second super admin is not elevated; support cannot approve an MFA reset |
| `readonly.spec.ts` | Employee and auditor have no enabled write or approve controls on policies, access and audits, and cannot open the Risk Register |
| `password.spec.ts` | The policy is wired to the live Set password form |
| `injection.spec.ts` | Hostile strings in URL paths, query strings and fragments, in the main create forms and in the customer search never execute or become markup; CSV export guards formula cells |
| `vendor-portal.spec.ts` | Email, code `123456`, second factor choice, masked email; upload rejection of disallowed type and oversize, acceptance of a valid file (files are generated in memory, no fixtures) |
| `headers.spec.ts` | CSP, nosniff, frame options, referrer policy, permissions policy, COOP, HSTS, no `X-Powered-By`; a browser refuses to frame the app |

Conventions: the persona is set with `localStorage['assurance.v1']` through `page.addInitScript` (`e2e/helpers.ts`, `openAs`). Elevation is in-memory, so tests that need it navigate client-side with `window.next.router.push` (`nextPush`) instead of `page.goto`.

## How CI works

`.github/workflows/ci.yml` (repository root, working directory `front-end`):

1. `verify` job: Node 22, `npm ci`, typecheck, unit tests, production build, `npm audit --omit=dev --audit-level=high`.
2. `e2e` job (after `verify`): `npm ci`, `npx playwright install --with-deps chromium`, `npm run test:e2e` (Playwright builds and starts the app itself), and uploads `playwright-report/` as an artifact only on failure.

The workflow has `permissions: contents: read`, no secrets, third-party actions pinned by major version, an npm cache keyed on `front-end/package-lock.json`, and a concurrency group that cancels superseded runs. `.github/dependabot.yml` opens weekly grouped minor/patch updates for npm (`/front-end`) and GitHub Actions.

## Not covered

- Backend and API behaviour: the app runs on in-memory mock data, so server-side authorization, persistence and audit integrity are untested. UI gating is not a control; the API must enforce every rule (see `docs/security/SECURITY.md` and `docs/security/SOD_MATRIX.md`).
- Real authentication: sign-in, MFA, passkeys and sessions are simulated. The vendor code `123456` and the "key touch" are demo stand-ins.
- Visual regression: no screenshot comparison, and no responsive checks. Dark and light themes are covered for accessibility only (axe, below).
- Cross-browser: Chromium only (Firefox and WebKit are not run).
- Load and performance testing. Accessibility is partly covered: `e2e/a11y.spec.ts` runs axe (WCAG 2.2 A and AA) on every route in light and dark and fails on serious or critical findings, but automated rules find only a part of the problems, so keyboard walk-throughs and screen-reader checks remain manual.
- The `useElevation` React hook (its on-screen clock and countdown): unit tests run in plain Node with no component renderer, so only the module behind it is tested. The e2e test checks the "expires in" banner appears.
- Upload content scanning: only name, extension and size gates are exercised.

## Known gaps found while writing the tests

- A missing favicon used to log a 404 console error on every page. The app now ships `public/favicon.svg` and the e2e console check no longer excludes anything.
