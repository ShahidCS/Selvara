# Repository organisation

## Map
| Path | Purpose |
|---|---|
| `front-end/` | The Next.js application, with its own `package.json`. Kept as one folder because Vercel, the workflows and Dependabot point at it. |
| `front-end/src/features/<name>/` | One folder per product module: its `<Name>Module.tsx` entry, subcomponents, and the services, lib helpers and seed data only that module uses. `index.ts` is its public API. |
| `front-end/src/components/` | Shared UI: `ui` (primitives), `shell` (layout), `kit` (pieces several features share) |
| `front-end/src/{lib,services,hooks,data}/` | Shared infrastructure used by two or more features, including the protected security files |
| `docs/architecture/` | What the product is and why: inventory, decisions, frameworks, porting guide, spec-board comparison, and `STACK.md` (every package and version, generated) |
| `docs/guides/` | How to work with it: testing, and `CHECKLIST.md` (source feature to React component map) with per-module notes in `checklist/` |
| `docs/security/` | Security contract and posture: SoD matrix, controls and limitations, pipeline, accepted risks |
| `docs/screenshots/` | Images used by the README |
| `.github/` | Workflows, the local deploy action, pipeline scripts, rulesets, CODEOWNERS, Dependabot, templates |
| `.zap/` | ZAP scan rules |

## Placement rules
1. A file a tool requires at a fixed location stays there (`package.json`, `next.config.js`, `vercel.json`, `.github/workflows/`).
2. Documentation goes under `docs/`, in the subfolder that matches its purpose.
3. Application source goes under `front-end/src/`. Code only one module uses goes in that module's `src/features/<name>/` folder; code two or more modules use goes in shared code. ESLint enforces the boundary (see `AGENTS.md`). Developer tools for the app go under `front-end/scripts/`. Pipeline logic goes under `.github/scripts/`.
4. Web-served assets go in `front-end/public/`.
5. Build output, exports, logs and secrets are never committed.
6. Unsure? Ask before moving it, because other files may reference the path.

Create a folder only when there is content for it.
