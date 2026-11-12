# Frameworks (Phase 1)

> **Wave C update.** The library is a data table (`/ws/frameworks`, with KPI strip, kind tabs, region filter and search); a framework is a page (`/ws/frameworks/:id`, with a KPI strip and requirement-status donut) and adding one is a page (`/ws/frameworks/new`). Wherever this checklist says "details panel", read "the framework page". Snooze and scope toggles stay in the row and do not open it.

| Source feature | Source lines | React file | Status |
|---|---|---|---|
| Library header, draft banner, kind cards (All/Standards/Frameworks/Regulations) with in-scope + average readiness | 1805-1829 | `features/frameworks/FrameworksModule.tsx` | Done |
| Region filter, text search, "n of N shown" | 1830-1840 | `FrameworksModule.tsx` | Done |
| Library table: name+kind chip+counts, region, segmented readiness bar + legend, Active/Snoozed toggle, In scope toggle (admin only, read-only chips otherwise), Details/Open | 1809-1860 | `FrameworksModule.tsx`, `frameworks/FwSegsBar.tsx` | Done |
| Empty state "Nothing matches these filters" | 1860 | `FrameworksModule.tsx` | Done |
| Scroll selected detail into view | 1801, 1862 | `FrameworksModule.tsx` | Done |
| Detail header, 4 metric cards, status legend, Export gap assessment (CSV, formula guard), View in controls, Close | 1868-1905 | `frameworks/FwDetail.tsx` | Done |
| Groups panel with per-group met/total and bar | 1925-1938 | `FwDetail.tsx` | Done |
| Requirement status chips with counts, search, group chip + Clear, "Show N more", "Show less", empty state | 1940-1985 | `FwDetail.tsx` (`ReqPane`) | Done |
| Requirement row: expand, guidance, mapped control chips (open control drawer), remove mapping, "mapping edited" note, N/A record | 1987-2025 | `FwDetail.tsx` (`ReqRow`) | Done |
| Admin: map/unmap control, mark N/A (min 15 chars validation), make applicable again, audit log + toasts | 2027-2062 | `FwDetail.tsx` | Done |
| ISO 27001/27002 Annex A catalogue (93 controls, theme counts, coverage chips) | 1907-1923 | `FwDetail.tsx` (`AnnexCard`) | Done |
| Add a framework: 4 templates, fields, keyword matcher preview, coverage chip, validation, save to library | 2065-2127 | `frameworks/FwAdd.tsx`, `features/frameworks/lib/fwTemplates.ts` | Done |
| Scoring model: requirement status from mapped controls, seeded mappings, readiness bands | 1746-1792 | `lib/frameworks.ts` | Done |
| Read-only message for non-admins | 1957 | `FwDetail.tsx` | Done |

## Open questions
1. Library sort uses `KORD[kind]||3` in the source; `Standard` is `0`, so Standards sort last (Frameworks, Regulations, Standards), probably unintended. Ported as-is. Should Standards come first?
2. Adding a framework with a name that slugs to an existing id is blocked ("already in the library"); custom ids are derived from the short name. No uniqueness check beyond that.
