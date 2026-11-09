# My Work (Phase 1)

| Source feature | Source lines | React file | Status |
|---|---|---|---|
| 4 KPIs (Assigned, Overdue, Due this week, Approvals waiting) | 1586-1592 | `components/modules/WorkModule.tsx` | Done |
| Issues assigned to you table (owner match + 3 others, severity chip, overdue in red, row opens Issues) | 1586-1596 | `WorkModule.tsx` | Done |
| Reviews & approvals list (3 static items, Open toast) | 1587-1597 | `WorkModule.tsx` | Done |
| Request access modal (validation "System is required.", pushes to access queue, switches Access to Requests tab) | 3004-3005 | `components/modules/work/RequestModals.tsx`, `lib/requests.ts` | Done |
| Request a new vendor modal (validation "Vendor name and purpose are required.", audit log, toast) | 3260-3262 | `RequestModals.tsx` | Done |

## Open questions
1. "Assigned to you" matches issues by the literal owner surname of the primary demo user (now "Avery"), as the source did, for every role. Should it follow the signed-in persona?
