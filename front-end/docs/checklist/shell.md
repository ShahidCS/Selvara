# Shell, layers and cross-cutting behaviour (Phase 1)

| Source feature | Source lines | React file | Status |
|---|---|---|---|
| Design tokens (light/dark/auto), base, controls, layout, liquid glass, print, reduced motion/transparency CSS | 11-624 | `src/styles/portal.css` (verbatim) | Done |
| App grid shell `#app` (sidebar/topbar/main), collapsed rail, mobile off-canvas + scrim | 82-89, 550-575, 1120+ | `components/shell/AppShell.tsx` | Done |
| Sidebar: grouped accordions, counts, active marker, logo | 1185-1258 | `components/shell/Sidebar.tsx` | Done |
| Group open state fixed on first render (prototype behaviour) | 1196 | `Sidebar.tsx` | Done |
| Space switcher (Workspace/Admin), shown only for multi-space roles; rail icon variant | 1226-1236 | `Sidebar.tsx` | Done |
| Sub-navigation accordion parents (Risk, Audit log, AI Assistant) + sync with module tabs | 1259-1289 | `Sidebar.tsx`, `lib/subnav.ts` | Done (modules must read `useModState(SUBNAV[x].stateKey)`) |
| Collapsed-rail tooltip + sub-item flyout, 90/120 ms hover delays, focus support | 1291-1330 | `Sidebar.tsx` (`NavTip`) | Done |
| Arrow-key roving focus through nav rows | 1319-1325 | `Sidebar.tsx` | Done |
| Topbar: hamburger, collapse, breadcrumbs (incl. Billing > customer), search, bell, theme cycle, account | 1328-1346 | `components/shell/Topbar.tsx` | Done |
| Role switcher popover (9 roles), "Sign-in & security" link, audit log entry, toast | 1172-1180 | `Topbar.tsx` | Done |
| Notifications popover | 1371 | `Topbar.tsx` | Done |
| Theme cycle auto > light > dark, persisted | 1349 | `Topbar.tsx`, `lib/store.ts` | Done |
| Drawer, modal, popover, scrim, Escape, focus trap + restore | 1351-1357 | `components/shell/LayerProvider.tsx` | Done (adds a11y: focus trap, `aria-modal`) |
| Toast with animated check, negative-message detection, 2.2 s | 1358-1364 | `LayerProvider.tsx` | Done |
| Command palette (Ctrl/Cmd+K), arrow/Enter, filter by label+group | 1374-1385 | `LayerProvider.tsx` (`Palette`) | Done (adds listbox ARIA) |
| Ctrl/Cmd+B collapse, Escape closes mobile sidebar | 4293-4297 | `AppShell.tsx` | Done |
| Router + RBAC guard + landing per role + Not found | 1387-1410 | `AppShell.tsx`, `lib/route.ts`, `lib/rbac.ts`, `pages/*` | Done (hash routes became paths) |
| Persistence (role, theme, collapsed) | 755-757 | `lib/store.ts` | Done |
| Reset demo data modal (`confirmReset`) | 4271 | not yet | Phase 3 (belongs with Team & Settings) |
| Page scaffold, table builder, KPI, delta, chips, status chip, ring, spark, trend chart, empty | 705-720, 1412-1450 | `components/ui/*` | Done |
| Skip link, visible focus, ARIA landmarks | n/a (added for WCAG 2.2 AA) | `AppShell.tsx` | Added |

## Open questions
1. The prototype loads Inter from Google Fonts. Per your decision the stack is SF Pro Display/Text with system fallbacks and no web-font request. On non-Apple devices the fallback chain (Inter if installed, then system UI) applies.
2. `go('#/auth')` Sign-in & security is a standalone screen (`/auth`); it ships in Phase 3.
