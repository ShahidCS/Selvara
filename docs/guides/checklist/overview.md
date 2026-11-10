# Overview (Phase 1)

| Source feature | Source lines | React file | Status |
|---|---|---|---|
| Header "Security posture · <Month Year>", subtitle with live counts | 1573 | `features/overview/OverviewModule.tsx` | Done |
| Actions: Export board pack, Reports, Open my work | 1573 | `OverviewModule.tsx` | Done |
| 6 KPI tiles with delta indicators | 1548-1556 | `OverviewModule.tsx` (`Kpi`, `Delta`) | Done |
| Risk Posture card: count, trend chip, 7-month trend chart with tooltips, issues-by-severity bars | 1565-1572 | `OverviewModule.tsx` (`TrendChart`) | Done |
| Framework Readiness: 6 lowest, link to Frameworks | 1558-1560 | `OverviewModule.tsx` | Done |
| Needs Attention: overdue issues and vendors, audits in motion (clickable, keyboard operable) | 1573-1580 | `OverviewModule.tsx` (`activate`) | Done |
| Control coverage heat map + legend | 1432-1450, 1581 | `OverviewModule.tsx` (`CoverageHeatmap`), `lib/boardPack.ts` | Done |
| Board & executive pack (standalone printable HTML, escapes all values, print CSS, Print/Save as PDF) | 1451-1543 | `lib/boardPack.ts` | Done |
| Export: open in new tab, else download, toasts, audit log entry | 1544-1547 | `OverviewModule.tsx` | Done (uses a blob URL instead of `document.write`) |

## Open questions
1. Several delta strings ("+3 pts this month", "next in 136 days", "2 overdue") are static text in the source, not computed. Ported as-is.
