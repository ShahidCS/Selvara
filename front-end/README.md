# Selvara: front-end

React / Next.js (Pages Router, TypeScript) migration of the original single-file HTML prototype (then called "Assurance GRC Portal").
The original design tokens and component CSS are kept verbatim (`src/styles/portal.css`); Tailwind provides layout utilities mapped to the same tokens
(preflight disabled so the original base styles are untouched). All data is synthetic and in memory.

## Run

Requires Node 20.9+ (tested on Node 22) and npm.

```bash
cd front-end
npm install
npm run dev        # http://localhost:3000
```

```bash
npm run typecheck  # tsc --noEmit
npm run build      # production build
npm start          # serve the production build
```

## Configuration

Copy `.env.example` to `.env.local`. There are no secrets in this repository.

| Variable | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_API_MODE` | `mock` | `mock` serves seeded synthetic data from `src/data`; `http` calls the API below |
| `NEXT_PUBLIC_API_BASE_URL` | empty | Base URL of the GRC API (used only in `http` mode) |

**Auth:** there is no real authentication. The top-right role switcher is a demo-only stand-in (twelve personas incl. second approvers, per-role module access). A real
integration should replace `src/lib/rbac.ts` + the role in `src/lib/store.ts` with the session, and send credentials via cookies (`apiFetch` uses `credentials: "include"`).

**Browsers:** last 2 versions of Chrome, Edge, Firefox, Safari and iOS Safari. **Accessibility target:** WCAG 2.2 AA (focus-trapped dialogs, keyboard operable rows, ARIA on the palette/menus, skip link, reduced-motion and reduced-transparency respected).

## Layout

```
src/
  pages/        Next routes: /ws/[[...slug]], /admin/[[...slug]], /auth, /  (hash routes of the prototype became paths)
  components/
    shell/      AppShell, Sidebar, Topbar, LayerProvider (drawer, modal, popover, palette, toast)
    ui/         Icon, Chip, StatusChip, Kpi, Table, Page, Empty, Ring, Spark, TrendChart, ...
    modules/    one file per screen + registry.ts (route key -> component)
  hooks/        useLayer
  services/     API stubs (http.ts, controls.ts, ...), mock mode by default
  lib/          store, rbac, route, data (DATA), audit (hash-chained log), frameworks (scoring), metrics, format
  data/         synthetic seed JSON
  styles/       portal.css (original CSS), globals.css
  assets/       static assets (the prototype is icon-only; icons are in data/icons.json, coolicons MIT)
docs/
  INVENTORY.md       what the sources contain + decisions
  CHECKLIST.md       source feature -> React component map (index) and docs/checklist/*.md per module
  PORTING_GUIDE.md   conventions used to port each module
scripts/             dev tools to extract/anonymise seed data from the prototype (the prototype HTML is not in this repo)
```

## Status

All 29 portal routes plus the five screens the spec boards added are migrated (`docs/CHECKLIST.md`). Security contract (segregation of duties, privileged access, credential policy): `docs/SOD_MATRIX.md`. Open owner decisions: `docs/DECISIONS.md`. Security notes and test log: `docs/SECURITY.md`.

## Review note

Generated code, configs and security controls need technical, security and management review before any deployment. The demo audit-log hash is a tamper-evidence illustration, not a security control.
