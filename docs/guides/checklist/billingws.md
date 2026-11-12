# Billing & Invoices, workspace view (Phase 3)

> **Wave E update.** The overview has a KPI strip and the invoices are a data table. Change plan (`/ws/billingws/plan`) and update payment method (`/ws/billingws/payment`) are pages; the payment page still keeps display values only.

| Source feature | Source lines | React file | Status | Notes |
|---|---|---|---|---|
| Seeds (`SUBSCRIPTION`, `PLANS`, `PLAN_MODULES`) | 3698-3701, 3779-3784 | `src/data/billingWsSeed.json`, `src/data/plans.json`, `services/billing.ts` | Done | the real company name replaced with "Example Co Ltd" |
| KPIs (Plan, Seats n/N + % with bad tone >= 90%, Next bill, Invoices) | 3705 | `BillingWsModule.tsx` | Done | "All paid" is static text |
| Usage meters (rounded %, capped at 100, red >= 90%) | 3702, 3707 | `BillingWsModule.tsx` (`Meter`) | Done | Added `role=progressbar` + aria values |
| Subscription card (plan, cycle, renews), Compare & change plan | 3709-3710 | `BillingWsModule.tsx`, `billingws/BillingForms.tsx` (`PlanForm`) | Done | Header "Manage plan" opens the same modal |
| Change plan (radio cards, price/mo, seats, modules, "Current" chip, seat limit + amount update, wsLog `billing.plan.changed`) | 3722-3725 | `BillingForms.tsx`, `services/billing.ts` | Done | Pick checked against `PLANS`; same plan = just closes |
| Payment method card and Update payment method modal (brand, last 4 digits only, expiry, billed to; blanks keep old value) | 3711-3713, 3720-3721 | `BillingForms.tsx` (`PaymentForm`), `services/billing.ts` | Done | wsLog `billing.payment.updated` (brand + last4) |
| Invoices table + Download (text file, wsLog `invoice.downloaded`) | 3716, 3719 | `BillingWsModule.tsx`, `services/billing.ts` (`invoiceText`) | Done | File name through `safeFileName`; toast "Download not available in this view" if blocked |

## Open questions
1. Downgrading below `seatsUsed` is allowed (e.g. Starter 5 seats while 24 used): seat KPI shows > 100% and the meter caps at 100%. Source behaviour; the help text only says downgrades "may require reducing seats".
2. Plan change is immediate in the UI although the copy says it takes effect next billing cycle.
3. The source applies no gate on payment/plan changes; `billingCanManage` (= module access) was added, read-only otherwise.
4. Expiry is free text (no MM / YY validation); "Do not enter a real card number" is the only guard.
5. `PLANS` is duplicated knowledge with the platform Billing module (admin space); if that module extracts the same data it should share `src/data/plans.json`.
6. Invoice KPI says "All paid" even if a status were different.

## Security notes
UI gate only. The real API must authorize plan/payment changes (billing admin), tokenise cards with the payment provider's hosted fields (this UI only edits display values: brand, last 4, expiry, name and must never collect PAN/CVC; PCI scope), compute prices and seat limits server-side, and generate/serve invoices itself (the text invoice here is a synthetic sample). Amounts and text render as React text; the download name is sanitised.
