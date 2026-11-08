# Billing (platform admin, Phase 4)

| Source feature | Source lines | React file | Status | Notes |
|---|---|---|---|---|
| KPIs (MRR, Active, Past due, On trial) | 3981-3982 | `billing/BillingList.tsx` | Done | MRR = plain sum of `mrr` as USD |
| Customers table: search (name/id/plan), 6 per page, pager, empty state, row opens detail | 3984, 4004-4010 | `BillingList.tsx` | Done | Rows keyboard-operable (`activate`) |
| Billing details side panel: select customer, 420 ms skeleton, contact, tax line, invoices, "Open full billing" | 3985, 4011-4021 | `BillingList.tsx` | Done | Timer cleared on unmount |
| Header actions: Onboard customer (goes to Customers and opens the modal), Pricing & plans, Export (toast), Issue invoices | 3986 | `BillingModule.tsx` | Done | Export is a toast only, as in the source |
| Pricing & plans modal + save, adminLog `pricing.updated` | 3989-4003 | `billing/BillingModals.tsx` (`PricingForm`), `services/billing-admin.ts` | Done | Source coercion kept (ints, `||0`, >= 0); upper bounds and an error line added |
| Issue invoices modal + `invoices.issued` adminLog | 4029-4032 | `BillingModals.tsx` (`IssueInvoicesBody`) | Done | Demo only, first 8 customers listed |
| Detail route `/admin/billing/<id>`, Current / History tabs, balance banner, Print | 4033-4047 | `billing/BillingDetail.tsx`, `BillingModule.tsx` | Done | Unknown id: "Page not found" state |
| Invoice actions Mark paid / Retry / Void, adminLog `invoice.marked_paid/payment_retried/voided` | 4024-4028, 4045 | `BillingDetail.tsx`, `services/billing-admin.ts` (`invoiceAction`) | Done | Looked up by invoice id (source: array index); service enforces the UI preconditions |
| Resend invoice (adminLog `invoice.resent`), PDF (toast) | 4023, 4045 | `BillingDetail.tsx` | Done | |

## Open questions
1. Customer list/side panel read tax from `RATES` (seed), not the Rates module's editable copy, so a rate/tax edit there never shows here (source: separate `RATE.rows` clone). Ported as-is; switching needs one shared list.
2. Void and Mark paid are one click, no confirmation. Void is offered on Paid invoices too, and voiding does not recompute the balance or customer status.
3. Mark paid sets `balance = 0` for the customer (not a recomputation) when no other invoice is Past due.
4. Side panel shows "Active" for any non-Past-due/non-Trial customer; list shows "Paid" for the same customer.
5. `billingSavePricing` mutates the shared `PLANS` price used by the workspace Billing view and by Change plan, but existing customers' `mrr` is not recomputed.
6. Currency formatting: `money()` uses 0 decimals for non-USD; amounts such as PKR are shown whole. Source behaviour.
7. Pager text always says "N customers" even when filtered.

## Security notes
* Role gate: Support and Super both have `billing` in `ROLE_MODS`; no in-function gates in the source. UI + service check (`billingCanManage`, deny by default) are demo only; the API must authorise per action and tenant.
* Money: amounts are plain numbers in major units; only MRR is summed client-side. Real API: integer minor units, server-side tax/total/balance, rate locked to the invoice at issue time, never trust client amounts or status.
* Idempotency: transitions are guarded by the current status (Paid/Retry need Past due; Void not already Void), but a real API needs a request id. Every mutation logs to the admin chain with `tenant`, before/after where the source had them.
* Audit entry `invoice.resent` stores the billing e-mail (PII); consider logging an id instead.
* No card numbers are collected or shown anywhere in this module. Exports are toasts (no files); if made real, use `csvCell` + `safeFileName`.
* Customer id from the URL is looked up as an own property of `CUSTOMERS`; unknown ids render "Page not found".
