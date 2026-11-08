# Exchange Rates & Tax (platform admin, Phase 4)

| Source feature | Source lines | React file | Status | Notes |
|---|---|---|---|---|
| Intro copy, held count, Details toggle, "Rate rules" panel | 4058-4062 | `RatesModule.tsx`, `services/rates.ts` (`RATE_THRESHOLDS`) | Done | Thresholds 3% / 1% / 48h rendered from constants (copy unchanged) |
| Refresh rates (spinner 950 ms, toast), Run sample feed (toast) | 4063, 4086 | `RatesModule.tsx`, `refreshRates` | Done | Refresh changes no data (source); timer cleared on unmount |
| Search + region chips (`All, MENA, Europe, APAC, Americas, Africa`; US counts as Americas) | 4050-4051, 4065-4069 | `RatesModule.tsx` | Done | State persists (`rates.*`) |
| Rates table (rate format 4 decimals under 10, tax, effective, Held chip with reason tooltip) | 4070-4074 | `RatesModule.tsx` | Done | Empty state "No countries match" |
| Approve / Reject Held rates | 4075 | `RatesModule.tsx`, `services/rates.ts` (`decideRate`) | Done | Only Held rows; both set Applied (see Q1) |
| Edit drawer (currency, rate, tax type, tax rate, effective) and save | 4076-4085 | `rates/RateEdit.tsx`, `parseRateEdit` / `saveRate` | Done | Validation added (see below) |
| `nowStamp` / `nowStampUTC` / `synthIP` helpers | 4124-4126 | `lib/format.ts`, `lib/adminAudit.ts` (already present) | Done | Not duplicated |

## Open questions
1. **Reject keeps the new rate.** The source marks a rejected rate Applied with the held value and the toast says "previous rate kept", but the previous rate is not stored. Ported as-is; needs `previousRate` in the model.
2. No audit entry (`adminLog`/`wsLog`) exists for approve, reject, edit or refresh in the source. Ported as-is (none added). Strongly recommended to log them.
3. Thresholds (3% move, 1% feed disagreement, 48h stale) exist only as text and as seeded `reason` strings; no client logic evaluates them. They must be enforced where feeds are ingested.
4. The editable rows are a deep copy of the seed `RATES` (source `RATE.rows`); Billing keeps reading the original list (see billing.md Q1).
5. Blank, non-numeric or **0** numeric inputs keep the old value (`parseFloat(x)||old`), so a 0% tax cannot be set. Ported as-is.
6. Currency edit changes the code without checking it against customers' currencies; the key is the country code, not the currency.
7. Effective date is free text (max 20), not validated as a date; "Last updated Today, 06:00 GST" is static.
8. The Held reason is only a hover tooltip (`title`); not available to keyboard or touch users.
9. Regions are on the rows (US has none, hence the Americas special case).

## Security notes
* Role gate: Support and Super both have `rates`; no in-function gate. UI + service check (`ratesCanManage`) deny by default; demo only. The API must authorise and the "Held" decision must be server-side: a client must never be able to set a rate to Applied.
* Added validation (the source accepted any value): exchange rate must be > 0 and <= 10,000,000; tax rate 0 to 100; currency a 3-letter code (uppercased); tax type from the list; effective date clamped. New messages: "Enter an exchange rate greater than 0 and no more than 10,000,000.", "Enter a tax rate between 0 and 100.", "Enter a 3-letter currency code, for example USD.", "Choose a tax type from the list."
* Rate-feed integrity: two-feed cross-check, staleness and move thresholds, signed feed data, previous-rate retention, per-invoice rate locking and an audit trail for every override must live on the server.
* Money precision: rates are JS floats as in the source (display only here); the API should use fixed-precision decimals.
* No HTML sinks; the Held reason and all values render as React text.
