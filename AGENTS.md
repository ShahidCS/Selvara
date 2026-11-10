# Agent instructions

Selvara is a GRC portal: Next.js 16 (Pages Router), React 19, TypeScript, Tailwind. Data is synthetic and in memory; there is no backend. Canonical instructions for AI coding agents live in this file.

## Commands (run in `front-end/`)
- Install: `npm ci --ignore-scripts`
- Typecheck: `npm run typecheck`
- Unit tests: `npm test`
- Build: `npm run build`
- All three: `npm run ci`
- End to end: `npm run test:e2e`
- Pipeline policy checks (from the repo root): `node .github/scripts/check-workflows.mjs`, `bash .github/scripts/verify-pins.sh`
- Lint: `npm run lint` (ESLint flat config in `front-end/eslint.config.mjs`). The one remaining legacy violation (src/lib/elevation.ts) is a warning capped by `--max-warnings` in `package.json`: fix some, lower the cap; never raise it.

## Layout
- `front-end/src/` pages, components, lib, services, data, hooks, styles, assets. `front-end/tests/` unit, `front-end/e2e/` Playwright.
- `docs/architecture/`, `docs/guides/`, `docs/security/` all documentation. See `docs/ORGANIZATION.md`.
- `.github/` workflows, local composite action, pipeline scripts, rulesets, CODEOWNERS.

## Conventions
- Business rules live in `src/services` and `src/lib`, deny by default, throw `SodError`, write an audit entry. UI gating is never the control.
- Never self-approve: follow `docs/security/SOD_MATRIX.md`.
- Synthetic data only. No secrets, tokens or real personal data anywhere.
- Conventional commits. Do not push to `main`; open a pull request only when asked.

## Do not touch without explicit approval
- `.github/workflows/`, `.github/actions/`, `.github/rulesets/`, `.gitleaks.toml`, `.zap/`
- `front-end/next.config.js`, `front-end/vercel.json` (security headers and CSP)
- `front-end/src/lib/{security,sod,approvals,elevation,credentials,rbac}.ts`, `front-end/src/data/roles.json`
- Dependency versions (Dependabot manages them)
