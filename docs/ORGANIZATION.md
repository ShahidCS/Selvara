# Repository organisation

## Map
| Path | Purpose |
|---|---|
| `front-end/` | The Next.js application, with its own `package.json`. Kept as one folder because Vercel, the workflows and Dependabot point at it. |
| `docs/architecture/` | What the product is and why: inventory, decisions, frameworks, porting guide, spec-board comparison |
| `docs/guides/` | How to work with it: testing, and `CHECKLIST.md` (source feature to React component map) with per-module notes in `checklist/` |
| `docs/security/` | Security contract and posture: SoD matrix, controls and limitations, pipeline, accepted risks |
| `docs/screenshots/` | Images used by the README |
| `.github/` | Workflows, the local deploy action, pipeline scripts, rulesets, CODEOWNERS, Dependabot, templates |
| `.zap/` | ZAP scan rules |

## Placement rules
1. A file a tool requires at a fixed location stays there (`package.json`, `next.config.js`, `vercel.json`, `.github/workflows/`).
2. Documentation goes under `docs/`, in the subfolder that matches its purpose.
3. Application source goes under `front-end/src/`. Developer tools for the app go under `front-end/scripts/`. Pipeline logic goes under `.github/scripts/`.
4. Web-served assets go in `front-end/public/`.
5. Build output, exports, logs and secrets are never committed.
6. Unsure? Ask before moving it, because other files may reference the path.

Create a folder only when there is content for it.
