# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). Releases are cut from signed tags (see [docs/security/PIPELINE.md](docs/security/PIPELINE.md)).

## [Unreleased]

### Changed
- CI: the Chromium install step refreshes the package index and retries up to 3 times. One run failed because the Ubuntu archive index did not load on a runner image (every font package "unable to locate"); tests themselves are never retried.
- Lint is clean: 63 warnings cleared (unused imports and variables, unused disable directives, `any` replaced with real types, in-app links use `next/link`, in-place state mutations and set-state-in-effect patterns removed). No rule is downgraded and `npm run lint` fails on any warning (`--max-warnings=0`). The elevated-session clock in `src/lib/elevation.ts` no longer sets state in an effect: its clock is floored at the session's `startedAt`.
- Documentation moved into `docs/architecture/`, `docs/guides/` and `docs/security/`; `front-end/docs/` no longer exists.

### Added
- Unit tests for the elevated-session lifecycle (`tests/unit/elevation.test.ts`, 11 tests): expiry at the deadline, one-time expiry logging, role switches, re-elevation.
- Lint step in CI (`ci.yml`, inside the existing `verify` job, so required check names are unchanged).
- ESLint flat config (`front-end/eslint.config.mjs`); `npm run lint` works again (`next lint` was removed in Next 16). Existing violations are warnings under a ratcheting cap.
- `CONTRIBUTING.md`, `AGENTS.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md`, `.editorconfig`, `.gitattributes`, `.git-blame-ignore-revs`, issue templates and `docs/ORGANIZATION.md`.
- Secure CI/CD pipeline: static analysis, secret and dependency scanning, licence policy, SBOM, container and dynamic scanning, staging deploy and tag-driven production release.
- Next.js (Pages Router) front-end migrated from the HTML prototype.
