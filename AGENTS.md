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
- After changing dependencies, `tsconfig.json`, the Node version or `dependabot.yml`, regenerate the stack doc from the repo root: `node .github/scripts/generate-stack.mjs` (and `node .github/scripts/generate-notices.mjs` for production dependencies). `--check` verifies it.
- Lint: `npm run lint` (ESLint flat config in `front-end/eslint.config.mjs`). It is clean and `--max-warnings=0` in `package.json` keeps it that way: fix a new warning, do not downgrade the rule or raise the cap.

## Layout
- `front-end/src/` pages, features (one folder per module: components and its Module entry), components (shared ui, shell, kit), lib, services, data, hooks, styles, assets. `front-end/tests/` unit, `front-end/e2e/` Playwright.
- `docs/architecture/`, `docs/guides/`, `docs/security/` all documentation. See `docs/ORGANIZATION.md`.
- `.github/` workflows, local composite action, pipeline scripts, rulesets, CODEOWNERS.

## Conventions
- Feature boundaries: code used by one feature lives in `src/features/<name>/` (components, `services/`, `lib/`, `data/`). Another feature or a page imports it only through `@/features/<name>` (its `index.ts`). Shared code (`lib`, `services`, `hooks`, `components`, `data`) never imports a feature. ESLint enforces this (`eslint.config.mjs`). Code used by two or more features goes in shared code, for example `src/components/kit/`.
- Business rules live in `src/services` and `src/lib`, deny by default, throw `SodError`, write an audit entry. UI gating is never the control.
- Never self-approve: follow `docs/security/SOD_MATRIX.md`.
- Synthetic data only. No secrets, tokens or real personal data anywhere.
- Conventional commits. Do not push to `main`; open a pull request only when asked.

## Do not touch without explicit approval
- `.github/workflows/`, `.github/actions/`, `.github/rulesets/`, `.gitleaks.toml`, `.zap/`
- `front-end/next.config.js`, `front-end/vercel.json` (security headers and CSP)
- `front-end/src/lib/{security,sod,approvals,elevation,credentials,rbac}.ts`, `front-end/src/data/roles.json`
- Dependency versions (Dependabot manages them)
