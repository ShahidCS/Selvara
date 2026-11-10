# Porting guide (prototype HTML -> React/Next.js)

Source of truth: `Assurance-GRC-Portal.html` (single `<script>`, vanilla JS that builds HTML strings).
Each module is a `REND.<key>=(m,param)=>{...}` function plus its helper functions and drawers.
Port 1:1. Do not simplify, drop edge cases, or invent features. If something in the source is ambiguous or broken, port it as-is
and write the question into your module's checklist file under "Open questions".

## Where things live

| Concern | Location |
|---|---|
| Original CSS (verbatim) | `src/styles/portal.css`. Reuse the same class names. Add new CSS to `src/styles/modules.css` only when the source had inline `<style>` for it (and import it from `globals.css`). |
| Shell, layers | `src/components/shell/*` (Sidebar, Topbar, AppShell, LayerProvider) |
| UI primitives | `src/components/ui` : `Icon`, `Chip`, `StatusChip`, `ReqStatusPill`, `Kpi`, `Delta`, `Table`, `Page`, `Empty`, `Ring`, `Spark`, `TrendChart` |
| One module = one file | `src/features/<name>/<Name>Module.tsx` (default export). Export it from the feature's `index.ts`; `features/registry.ts` imports from there |
| Module-private subcomponents, services, lib and seed data | `src/features/<name>/` (subfolders `services/`, `lib/`, `data/`); shared pieces live in `src/components/kit/`; other features use the `index.ts` only |
| Demo data (synthetic) | `src/lib/data.ts` -> `DATA` (mutable), `src/lib/platform.ts` (customers, MFA requests, ...), `src/data/*.json` |
| State | `src/lib/store.ts` : `appStore/useApp` (role, theme, collapsed), `useData()` + `bumpData()`, `useModState(key, init)` |
| RBAC | `src/lib/rbac.ts` (`ROLES`, `ROLE_MODS`, `roleOf`, `modAllowed`, `fwCanAdmin`) |
| Audit log | `src/lib/audit.ts` : `wsLog(action,target,cat)`, `WS_AUDIT`, `verifyWsChain`, `getMe()` |
| Routing | `src/lib/route.ts` : `useRoute()`, `useGo()`. Hash routes `#/ws/risk` become paths `/ws/risk`. |
| Layers | `useLayer()` from `@/hooks/useLayer` : `openDrawer`, `openModal`, `popover`, `closeLayer`, `toast` |
| API stubs | `src/services/*` (see below) |
| Formatting | `src/lib/format.ts` : `money`, `num`, `nowStamp`, `csvCell`, `downloadText` |

## Conversion rules

1. `innerHTML = \`...\`` -> JSX. Keep every class name, inline style, text string, `title`, and `aria-*` exactly. Keep the markup structure (CSS depends on it).
2. `onclick="fn()"` -> React handlers. Global `let X=...` module state -> `useModState("<module>.<name>", initial)` so it survives navigation like the prototype
   (the prototype never reset filters when you left a module). Local, truly transient state (open/closed of one popover, text in a modal) -> `useState`.
3. The prototype mutates `DATA` then re-renders. Do the same: mutate `DATA` in an event handler, call `wsLog(...)` where the source did, then `bumpData()`.
   Components that read DATA call `useData()` at the top so they re-render.
4. `openDrawer(title, subHTML, bodyHTML, footHTML)` -> `L.openDrawer(title, subNode, bodyNode, footNode)`; content may be a function `(close)=>node`.
   For a form modal/drawer whose buttons need the form's state, render `<LayerFoot>…buttons…</LayerFoot>` (from `@/hooks/useLayer`) inside the body component: it portals the buttons into the fixed footer (see `features/work/RequestModals.tsx`).
   Drawer/modal content that has to react to DATA changes must be its own component that calls `useData()` (the layer renders children, so hooks work).
   `closeLayer(); toast(...)` sequences stay as they are.
5. `go('#/ws/x')` -> `go('/ws/x')`. `location.hash` reads -> `useRoute()`.
6. `toast()`, `confirm`-style modals, validation messages (`display:none` error `<p>` toggled on submit): port as controlled state with the same copy and the same condition.
   Inputs read by `$("#id").value` become controlled inputs or refs. Keep `id`/`for` pairs for labels.
7. File downloads: use `downloadText` / `blobDownload` from `@/lib/format`. Keep CSV formula-injection guard (`csvCell`). Keep filenames.
8. `window.open + document.write` (board pack, reports): keep behavior; the generated HTML must escape every interpolated value (`esc`).
9. Uploaded files (import wizard) are parsed client-side only. No network.
10. Timers/`setTimeout` simulations (AI "thinking", syncs): keep the same durations; clear them on unmount.
11. Anything that called a network API does not exist in the prototype (no `fetch`). If a module would need one, route it through `src/services` (see below), return the same seeded data.

## Accessibility (WCAG 2.2 AA is the target)

* Real `<button>` for every clickable thing (the prototype sometimes used `div onclick`; use `role="button" tabIndex={0}` + Enter/Space, or a `<button>`; keep classes).
* Tables: `<th scope="col">`, interactive rows reachable by keyboard. Icon-only buttons need `aria-label`. Color is never the only signal (keep the text/icon in chips).
* Modals/drawers are handled by `LayerProvider` (focus trap, Escape, focus restore). Give inputs labels.
* Respect the existing `prefers-reduced-motion` and `prefers-reduced-transparency` CSS. Do not remove focus outlines.

## Data and secrets

* All demo data is synthetic. Do not copy real names. Real names in the source were replaced with synthetic ones (e.g. "Jordan Avery", "Owen Hart", "Sam Hayes"). The real-name map is kept out of the repo: supply it locally through `ANON_MAP` (see `scripts/anonymize.js`) when extracting any further data. Third-party framework / standard names (ISO, NIST, GDPR, ...) stay.
* No keys, tokens, passwords or real hostnames. Sample IPs must stay in documentation ranges (203.0.113.x, 198.51.100.x, 192.0.2.x, 10.x).

## Extracting seed data from the source

The prototype's data arrays are plain JS. To avoid retyping, evaluate the relevant source lines in Node and dump JSON
(`scripts/extract-source.js <source.html> <fromLine> <toLine> <names>`), then run `anonymize.js` over the output and keep it under `src/data/`.

## API stubs (`src/services`)

The prototype has no network calls. Each module that mutates data should call the matching service function so a real API can be dropped in later:
`src/services/http.ts` (`apiFetch`, reads `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_API_MODE`), and one file per domain
(`controls.ts`, `risks.ts`, ...). In `mock` mode they resolve with the in-memory `DATA`. Keep UI behaviour identical (synchronous feel: do not add spinners the source did not have).

## Definition of done for a module

* Every feature, copy string, validation message, empty state, filter, sort, pagination, drawer, modal, export, and keyboard path in the source function(s) exists.
* `npx tsc --noEmit` and `npx next build` pass with no errors.
* Visually compared with the prototype (light + dark, desktop + <=760px).
* `docs/guides/checklist/<module>.md` written: table of `source feature | source lines | React component/file | status | notes`, plus "Open questions".

## Secure coding rules (mandatory; OWASP ASVS v4)

Client-side code is not a trust boundary. Everything the UI hides (RBAC, validation) must also be enforced by the real API; mark any place where the
prototype relied on the UI alone in your checklist under "Security notes".

1. **No HTML from strings.** Never use `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, `eval`, `new Function`, or string-built `setTimeout`. React escapes text; keep it that way (ASVS 5.2.4, 5.3.3).
   Generated standalone documents (reports, board pack) must escape every interpolated value with `esc()` from `@/lib/format` and must not embed user HTML.
2. **Links from data:** `href={safeHref(url)}` (`@/lib/security`); `target="_blank"` always with `rel="noopener noreferrer"`. No `javascript:`/`data:` URLs.
3. **Uploads (evidence, imports):** gate with `validateUpload` (extension allow-list, size, non-empty); display names via `safeFileName`; read with `FileReader`/`File.text()` only;
   never render uploaded content as HTML/SVG; CSV/XLSX imports are parsed as data and every cell is treated as text. Cap rows/columns when previewing (DoS).
4. **CSV/Excel exports:** every cell through `csvCell` (formula injection guard). Download names through `safeFileName`.
5. **Validate on input** with positive checks (length caps via `clampText`, `isEmail`, `isIsoDate`, enums checked against the allowed list, numbers range-checked). Keep the prototype's messages.
   Never trust ids from the URL: look them up in DATA and render "not found" when missing.
6. **No secrets or PII in client storage.** Only role/theme/collapsed UI preferences go to localStorage (via `lib/store.ts`). No tokens, no record data. Do not log record contents to the console.
7. **Audit log integrity (V7):** keep every `wsLog` call from the source; log security-relevant decisions (grants, revocations, approvals, exports, role switches) with an actor from `getMe()`; never log secrets. Log text is rendered as React text (no log injection into HTML).
8. **Authorization:** reuse `fwCanAdmin`-style role checks from `lib/rbac.ts`; deny by default; show a read-only state, not just a hidden button. Port every role gate in the source exactly. Where the source had none and the action is destructive/sensitive, port as-is and flag it under Security notes (do not invent policy).
9. **Randomness:** ids that were `Math.random()` in the source are demo ids only; do not use them for anything security-relevant. Use `crypto.randomUUID()` for new tokens/links (e.g. share links) if one is needed.
10. **Dependencies:** do not add npm packages without telling the lead (supply chain). Spreadsheet parsing for the import wizard is hand-written in the source; do not pull in a library.
11. **Errors:** show the prototype's messages; never render raw exception text. Wrap risky parsing (JSON.parse, file reads) in try/catch with a generic message (ASVS 7.4.1).
12. **Redirects/navigation** only to in-app paths via `useGo`.
