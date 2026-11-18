# Technology stack

> **Generated** by `.github/scripts/generate-stack.mjs` from `front-end/package.json`, `front-end/package-lock.json`,
> `.github/vercel-cli/package.json`, `front-end/tsconfig.json`, `.github/workflows/ci.yml` and `.github/dependabot.yml`. Do not edit it by hand:
> run `node .github/scripts/generate-stack.mjs` from the repository root after changing any of those files.
> "Declared" is the version or range in `package.json`; "Installed" is what the lockfile resolves.
> For what the product is and why it is built this way, see the Tech stack section of the [README](../../README.md).

## Runtime and platform

| Item | Value |
| --- | --- |
| Node.js used by CI, builds and releases | 22 |
| CI runner image | `ubuntu-latest` |
| Package manager | npm (`package-lock.json`; installs use `--ignore-scripts`) |
| Application name / version | `assurance-grc-front-end` 0.1.7 (private, not published) |
| TypeScript `strict` | **off** (`front-end/tsconfig.json`); `noImplicitAny`: off |
| TypeScript target / module resolution | `es2020` / `bundler` |
| Browser support (`browserslist`) | `last 2 Chrome versions`, `last 2 Edge versions`, `last 2 Firefox versions`, `last 2 Safari versions`, `last 2 iOS versions` |

## Application (shipped to users)

`dependencies` in `front-end/package.json`.

| Package | Used for | Declared | Installed |
| --- | --- | --- | --- |
| `@supabase/supabase-js` | Server-side client for Supabase Auth (and the sign-in tables), used only by the authentication API in src/server (never shipped to the browser) | `2.118.0` | `2.118.0` |
| `next` | Web framework: Pages Router, server rendering, build and dev server | `^16.4.5` | `16.4.5` |
| `pg` | Server-side Postgres driver for the module APIs, connecting as the row-level-security-bound selvara_app role (src/server/db.ts; never shipped to the browser) | `8.23.1` | `8.23.1` |
| `react` | UI library | `^19.3.1` | `19.3.1` |
| `react-dom` | React renderer for the browser | `^19.3.1` | `19.3.1` |

## Build, test and quality tooling

`devDependencies` in `front-end/package.json`. Not part of what is delivered to users.

| Package | Used for | Declared | Installed |
| --- | --- | --- | --- |
| `@axe-core/playwright` | Runs the axe accessibility rules against rendered pages in the end-to-end suite (development only; MPL-2.0 is allowed for dev dependencies) | `4.14.0` | `4.14.0` |
| `@playwright/test` | End-to-end browser tests (Chromium) | `1.65.0` | `1.65.0` |
| `@tailwindcss/postcss` | Runs Tailwind as a PostCSS plugin; its production optimiser also adds vendor prefixes, so autoprefixer is not used | `4.3.4` | `4.3.4` |
| `@types/node` | Type definitions for Node.js APIs | `22.20.5` | `22.20.5` |
| `@types/pg` | Type definitions for pg (development only) | `8.20.0` | `8.20.0` |
| `@types/react` | Type definitions for React | `^19.3.0` | `19.3.0` |
| `@types/react-dom` | Type definitions for React DOM | `^19.3.0` | `19.3.0` |
| `eslint` | Linting (flat config; see the lint script for the warning limit) | `^10.14.0` | `10.14.0` |
| `eslint-config-next` | Next.js, React and React Hooks lint rules | `^16.4.5` | `16.4.5` |
| `postcss` | CSS processing engine that the Tailwind plugin runs on | `8.5.32` | `8.5.32` |
| `tailwindcss` | Utility CSS (v4), mapped to the original design tokens; utilities only, no reset (preflight is not imported) | `4.3.4` | `4.3.4` |
| `typescript` | Type checking (tsc --noEmit); the build does not emit with it | `5.9.3` | `5.9.3` |
| `vitest` | Unit tests | `5.1.0` | `5.1.0` |

## Deploy tooling

`.github/vercel-cli/package.json`: an isolated install, kept apart from the application so the deploy token never meets application code.

| Package | Used for | Declared | Installed |
| --- | --- | --- | --- |
| `vercel` | Vercel CLI: builds and deploys the prebuilt output (runs only in the deploy workflows) | `65.12.1` | `65.12.1` |

## Related

- Production dependencies with their licences: [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) (also generated).
- CI/CD pipeline, scanners and pinned GitHub Actions: [docs/security/PIPELINE.md](../security/PIPELINE.md).
- Major versions Dependabot is told to ignore (each needs a planned migration, so these stay on their current major): `@types/node`, `typescript`. See `.github/dependabot.yml`.
