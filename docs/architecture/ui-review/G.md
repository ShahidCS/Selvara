# Group G: Layout and alignment (sidebar open or collapsed, every width)

Reviewed in November 2026 against the shipped v0.2.2 build (demo data), after the owner reported that a tour's highlight ring stayed in place when the sidebar was hidden.

How it was checked:
- **Every module and every tab.** Workspace modules were checked as `admin`, Admin Console modules as `super`, plus Sign-in & security.
- **Seven sizes:**
  - 1440 with the sidebar open, and with it collapsed
  - 1280 open
  - 1024 open, and collapsed
  - 768 open
  - 390
- **What an automated scan flagged:** page-level sideways overflow, elements pushed off the window, clipped text, children spilling out of their box, and siblings overlapping.
- **Records:** the first record of each module (page or dialog) at 1440, 1024, 768 and 390.
- **Tours:** every step of every module's tour at 1440, 1024 and 390. At 1440 and 1024 the sidebar was collapsed and expanded on each step, and each time the check confirmed the ring sits on its element, the bubble stays on screen and the app frame does not scroll.
- **Standalone pages:** sign-in, the vendor portal, the public Trust Center and the home page, at 390, 768, 1024 and 1440.

Before the fixes the scan reported 231 distinct findings. After them, it reports none except the expected ones listed at the end of this page. The checks behind the most important fixes are now end-to-end tests (`e2e/tours.spec.ts`, `e2e/layout.spec.ts`).

| ID | Severity | Finding | Fix | Where | Status |
|---|---|---|---|---|---|
| G-1 | 🔴 Critical | The tour's ring and bubble stay where they were when the sidebar collapses or expands. They were placed once, and again only on a window resize or scroll. The sidebar changes the layout without either, so the ring framed empty space and the bubble covered the wrong card (the owner's screenshot, Overview step 3). | They now re-measure their element every frame while a tour is open (`useAnchorWatch`), so they track it through the sidebar's animation, scrolling and content loading. The ring no longer animates, so it does not trail behind. | `src/hooks/useAnchorWatch.ts`, `src/components/kit/Tour.tsx` | fixed |
| G-2 | 🔴 Critical | When the layout changes under a tour (at 1024, collapsing the sidebar turns stacked cards back into columns), the highlighted element moved off screen and the bubble followed it off screen. | After a layout change (not after the person scrolls), an element that left the view is brought back. The bubble is always clamped inside the window. | `src/components/kit/Tour.tsx` | fixed |
| G-3 | 🔴 Critical | Bringing a tall element into view (Overview "Risk and readiness") used the browser's scroll-into-view. That also scrolls the app frame, which is not meant to scroll: the top bar and logo were pushed partly off the top until reload. | Only the box the element scrolls in (the page or a panel) is scrolled. | `src/components/kit/Tour.tsx` (`reveal`) | fixed |
| G-4 | 🟡 Moderate | The ring is drawn over the top bar when its element is partly scrolled out of view (Billing & Invoices, Subscription step). | The ring marks only the visible part of the element, clipped to its scroll area. | `src/components/kit/Tour.tsx` (`clip`) | fixed |
| G-5 | 🟡 Moderate | Popovers (row menus, filters, the account menu) stay where they opened when the window is resized or the sidebar is toggled with ⌘B while one is open. | They follow their trigger with the same hook. | `src/components/shell/LayerProvider.tsx` | fixed |
| G-6 | 🟢 Minor | The collapsed-rail label and sub-menu flyout stay put if the rail scrolls while one is shown. | They follow their item. | `src/components/shell/Sidebar.tsx` | fixed |
| G-7 | 🔴 Critical | With the sidebar open on a tablet or small laptop (about 761 to 1100px wide), the content area is around 300px narrower than the window. Every layout rule responded to the window width only, so multi-column pages kept their columns in too little space. Overview at 768 squeezed three cards into 480px: "Needs attention" was cut off, "All issues" sat off screen, and framework names shrank to "SAMA Cybe…". | The page and the top bar now respond to their own width (container queries on `main#content` and `#topbar`). Under 760px of content, panels and split views stack and the page scrolls, as on a phone. Under 900px, three-up card grids go to two columns. A collapsed sidebar gives the room back, and the columns return. | `src/styles/portal.css` (section "The page responds to the width it actually has") | fixed |
| G-8 | 🟡 Moderate | At 768 with the sidebar open, the account button stuck 4px past the window's right edge on every page, so the whole window scrolled sideways. The breadcrumb was squeezed to "North… Overvi…". | The top bar folds the search to its icon under 640px. Under 560px it drops the name from the account button and the company crumb, as on a phone. | `src/styles/portal.css` | fixed |
| G-9 | 🟡 Moderate | KPI change pills ("+3 pts this month", "2 fewer this month", "1 more this week", "Needs a second person") ran past their tile's edge at 1280 and at 1024 with the sidebar collapsed, touching the divider. | The pill wraps under the figure, and its text wraps inside it. | `src/styles/portal.css` (`.kpi-fig`) | fixed |
| G-10 | 🟡 Moderate | Long KPI figures ("$16,750.00" in Admin Billing, "Read-only" in Integrations) ran into the next tile at 1024. | A figure longer than 6 characters shrinks with its tile, down to 22px at the smallest. Short figures keep the full 36px. | `src/components/ui/KpiStrip.tsx`, `src/styles/portal.css` | fixed |
| G-11 | 🟡 Moderate | Card headers with a control on the right overflowed when the card was narrow: "View all" on Overview, the invoice-customer select in Admin Billing at 768, and "Cross-framework matrix" on Controls at 390. | Card headers wrap: the control moves to its own line, still aligned right. | `src/styles/portal.css` (`.card>.c-head`) | fixed |
| G-12 | 🟡 Moderate | Trust Center, Access & requests and Activity & history: the decision-history and viewer-activity tables pushed their column up to 206px wider than the page at 1024, 768 and 390. | Grid columns may shrink below their content (`min-width:0`), so a wide table scrolls inside its own box. | `src/styles/portal.css` | fixed |
| G-13 | 🟢 Minor | Team & Rules, "Workspace colour": the swatch picker ran 8px past its box at 768 and 390. | Segmented controls wrap. | `src/styles/portal.css` (`.seg`) | fixed |
| G-14 | 🟢 Minor | Audit log, Chain integrity: the hash values pushed the details list 43px past its card at 768. | Values in a details list wrap anywhere, and the value column may shrink. | `src/styles/portal.css` (`.meta-grid`) | fixed |
| G-15 | 🟢 Minor | Audit log, RoPA register: the "1 event" tag ran past the card at 390. | The card's title row wraps. | `src/features/auditlog/RopaRegister.tsx` | fixed |
| G-16 | 🟢 Minor | Risk, Governance tab: the entity cards overflowed their three-column grid by 9px at 1024 with the sidebar open. | Two columns under 900px of content, one under 760px (G-7). | `src/styles/portal.css` | fixed |
| G-17 | 🟢 Minor | After stacking (G-7), cards inside a card (the Trust Center resource list) kept the 260px floor meant for top-level panels, leaving large empty areas. | The floor now applies only to top-level panels, in both the narrow-content and the phone rules. | `src/styles/portal.css` | fixed |

**Expected, not findings:**
- Visually hidden labels (`.vh`) are clipped on purpose.
- The KPI strip clips the divider lines that fall outside it on purpose (see its comment in `portal.css`).
