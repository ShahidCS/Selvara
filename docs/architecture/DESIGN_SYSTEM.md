# Design system

The visual language of the portal. It follows the Flow-System-Design blueprint (calm, number-led, one brand colour, AI on its own surface) as measured tokens and patterns. Names, imagery and map tiles from the reference site are not used. Values live in `front-end/src/styles/portal.css`; this file explains the rules.

## Layers of tokens

1. **Raw ramps and blueprint names** (`--c-brand-500`, `--bg-canvas`, `--text-secondary`, ...). The blueprint values, unchanged.
2. **Legacy names** (`--bg`, `--surface`, `--ink`, `--muted`, `--accent`, `--bad-ink`, ...). Aliases of layer 1. Existing components and inline styles reference these, so a restyle by token needs no module edit. Only 25 distinct legacy names are used in feature code.
3. **Brand channel**: `--c-brand-*` only. A tenant re-skin overrides those six variables. Nothing else hard-codes violet.

Tailwind 4 utilities for the same tokens are declared in `front-end/src/styles/globals.css` (`@theme`): `bg-brand-500`, `text-danger-700`, `bg-subtle`, `rounded-xl`, `shadow-card`, `font-mono`.

## Rules

- **Colour is meaning, not direction.** Lime is the best state, success green is verified or closed, amber is due soon or review needed, red is overdue, failed or critical, violet is AI-assisted or in review, grey is neutral. A rising overdue count is red even though it goes up.
- **Status never rests on colour alone.** Every status carries an icon and a text label.
- **Lavender is AI.** Anything machine-authored sits on `--c-brand-50` with a `--c-brand-100` hairline.
- **Flat sections, floating overlays.** Cards have a hairline and no shadow. Shadows are for menus, drawers, modals and toasts. The `--glass-*` tokens remain so older rules resolve, but they are opaque.
- **Pills for controls, large radii for containers.** Controls and labels use `--radius-full`; fields `--radius-md` (10px); cards `--radius-lg` (16px); popovers and the command palette `--radius-panel` (20px); modals `--radius-xl` (24px).
- **Numbers lead.** Overline (11px, uppercase, +0.6px) above a light tabular figure. Use `.overline`, `.tabular`, and `.mono` for timestamps, hashes and audit entries.
- **Weights 300 to 600 only.**

## Deviations from the blueprint (deliberate)

| Item | Blueprint | Here | Why |
|---|---|---|---|
| Dark theme | none | derived from the inverse tokens (`#111113` canvas, `#1e1e22` surface, `#9b7bff` accent text) | the portal ships light, dark and auto |
| `--faint` (legacy "tertiary") | `#909097` | `#686970` | `#909097` is 2.8:1 on the canvas and carries real text in this product. The raw value stays as `--text-tertiary`, decorative only |
| `--muted` | tertiary-ish | `--text-secondary` `#55565c` | essential metadata must pass AA |
| Warning text | `#a86200` on `#fff6e5` (4.43:1) | `--c-warning-800` `#8a5000` (6.06:1) | blueprint section 9 asks for the darker shade at small sizes |
| Focus ring | `0 0 0 3px #2e5cff3d` | solid 2px `#2e5cff` outline (dark: `#8aa4ff`), halo available via `.focus-ring` | the 24% halo alone fails the 3:1 non-text contrast rule |
| Duration | 150 to 260ms | `--dur` 150ms | matches the blueprint |

Contrast of every legacy text and surface pair was computed for both themes: all text pairs are at least 4.5:1, the primary button is white on `#6c3bff` at 5.66:1.

## Typography

Geist and Geist Mono, SIL Open Font License 1.1, self-hosted from `front-end/public/fonts/` (the licence text is `OFL-Geist.txt` beside them). The CSP allows `font-src 'self'`, so no header change and no dependency. Arabic falls back to the system Arabic face (the blueprint names Noto Sans Arabic; it is not bundled).

## Status of the upgrade

| Phase | Scope | State |
|---|---|---|
| 1 | Tokens, fonts, radii, elevation, dark theme, contrast, focus | this change |
| 2 | Shell: 72px rail, notifications slide-over, toast with Undo, shortcuts, profile menu links, search landmark | this change (see below) |
| 3 | Shared kit: data table, KPI strip and card, AI panel, stepper, timeline, charts, switch, skeleton | not started |
| 4 | Module migration in waves; modal create and edit flows become pages | not started |
| 5 | Governance features (delegation, autonomy, rules, retention, notification matrix) | needs approval to touch `rbac.ts`, `approvals.ts`, `sod.ts` |
| 6 | RTL, density, print, tenant theming, automated accessibility tests | not started |

Decisions taken: all 33 modules stay in the rail with the existing fold and unfold behaviour; the Admin Console and vendor portal take tokens and templates only; create and edit modals become full pages; the reference colour codes are kept as specified.

## Shell (phase 2)

- **Rail**: the existing premium sidebar is kept as it is (module groups that fold and unfold, sub-navigation, collapsed flyouts, Workspace and Admin switch). Collapsed width is 72px and nav tiles use the 16px radius.
- **Notifications**: the bell opens a slide-over dialog (`role="dialog"`, focus trap, Escape) with All, Approvals and Alerts tabs, grouped items, and Mark all read. Items are derived from the same data the modules show (failing controls, controls needing evidence, overdue issues, vendor reviews, MFA reset requests, past-due invoices) and only for modules the role can open. An item opens the record to review. **Nothing is approved from the panel**: decisions in this product need a reason and a second person (`docs/security/SOD_MATRIX.md`), so inline Approve is deferred to phase 5, where it is built on the approval services.
- **Toast**: `toast(msg, ok, { action: { label, run } })` adds an action such as Undo. It stays 7 seconds, holds while hovered or focused, and is a `role="status"` live region. Use Undo only for reversible in-app state.
- **Shortcuts**: Ctrl or ⌘ plus K (jump to a module), J (AI Assistant), B (collapse sidebar), / (shortcut list). The profile menu keeps the role switcher and gains My workspace and Keyboard shortcuts. The Ask AI button and Ctrl+J are shown only to roles that can open the assistant.
- **Deferred**: the context-aware AI slide-over (the assistant lives in a feature, which shared shell code may not import; it is built with the assistant module in phase 4), presence and approval delegation (phase 5), language and RTL (phase 6).
