# Reports module checklist

Source: lines 3496-3525 (`REPORT_FREQ`, `SCHED_PACKS`, `REND.reports`, generate/schedule functions). React: `ReportsModule.tsx`, `reports/ReportLayers.tsx`, `src/services/reports.ts`. State: `src/lib/trustData.ts` (`SCHED_PACKS`, `REPORT_FREQ`). `DATA.reports` already existed.

| source feature | source lines | React file | status | notes |
|---|---|---|---|---|
| Readiness trend (6 fixed points + current compliance) with month labels and "% now" tag | 3503, 3506 | `ReportsModule` | done | `metrics().compliance`, `TrendChart` |
| Scheduled packs table (freq + detail, recipients, next, remove x) | 3507 | `ReportsModule` | done | |
| Stored reports table + "Generate now" | 3509 | `ReportsModule` | done | |
| Page action "New schedule", "Add" and "Schedule" buttons | 3507-3510 | `ReportsModule` | done | |
| Generate: plain-text draft download `<slug>.txt`, log `report.generated`, toast "Generated <name> (demo)" | 3511 | `svc.generateReport`, `ReportsModule.generate` | done | text only (no HTML), file name via `safeFileName`; toast changes if download blocked |
| Schedule modal: pack select, frequency (default Monthly), "Send on" , Custom field only for Custom, recipients, draft notice | 3512-3518 | `ScheduleForm` | done | |
| Save schedule: upsert by name, detail = custom or day, recipients default "—", next "Scheduled" ("—" for On demand), log `report.scheduled`, toast | 3519-3523 | `svc.saveSchedule` | done | |
| Remove schedule: log `report.unscheduled`, toast | 3524 | `svc.removeSchedule` | done | |

## Open questions
1. The "Send on" field is hidden when frequency is "On demand", but `REPORT_FREQ` has no "On demand" option, so that branch (and `next:"—"`) is unreachable from the UI. Ported as-is.
2. Seed `SCHED_PACKS` names ("Board security pack", ...) do not match `DATA.reports` names, so scheduling a stored report adds a new row rather than updating a seeded one; "Audit evidence pack" (frequency "On demand") cannot be recreated.
3. Recipients are free text (names, groups, emails) with no validation; "Next" never shows a real date.
4. "Generate now" produces a placeholder text file, not the real report. Board pack (Overview) is the only generated HTML document (`lib/boardPack.ts`, esc()).
5. The trend baseline numbers are hard-coded.

## Security notes
* Reports and distribution are UI-only gated (no role gate in source). The API must generate reports with the caller's permissions, restrict who may schedule distribution, and validate/limit external recipients (data-leak risk when emailing packs).
* Generated file is plain text containing only the report name and a timestamp; no user HTML is embedded. Any future HTML report must escape all values with `esc()` and open via blob URL as the board pack does.
* Download file name is sanitised; recipients/detail are clamped and render as React text.

## Hardening (docs/SOD_MATRIX.md, owner decision 2026-11)
Services throw `SodError`; `wsLog` kept; external distribution uses `lib/approvals.ts` (`ApprovalsPanel` "External distribution awaiting a different admin").

**What changed vs the prototype**
| Area | Prototype | Now |
|---|---|---|
| Schedule / remove / generate | ungated | admin/owner (`assertRole`), buttons disabled with the reason for others |
| External distribution | saved at once | recipients are external unless a known internal group (Board, Exec team, Risk Committee, ...) or an address on the workspace's own email domain (deny by default); an external schedule is a request that a DIFFERENT admin approves (owner/admin initiate, approver role admin); nothing is saved or distributed until then; internal-only schedules save at once; the row shows "External, approved by <name>" |
| "On demand" frequency (OQ 1, unreachable) | branch existed but `REPORT_FREQ` lacked it | "On demand" appended to `REPORT_FREQ` in `lib/trustData.ts` (minimal fix); "Send on" is hidden and detail empty for it, next = "—" |

**Resolved open questions (owner decision):** OQ 1. Still open: OQ 2-5.

**Open question added:** the internal-group list and the "own email domain" test are a heuristic for free-text recipients (see `externalRecipients` in `services/reports.ts`); the real API must validate recipient addresses against the tenant's directory and block external ones without approval.

**Security notes (additions):** changing an existing external schedule creates a new pending request; the previous approved schedule stays active until the new one is approved (the pending one is not applied in place).
