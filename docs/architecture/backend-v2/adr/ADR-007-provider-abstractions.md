# ADR-007: Provider abstractions for payment, tax, invoice numbering and AI

| | |
|---|---|
| Status | **Proposed** |
| Workstream | 2I (owner of this ADR); 2G (AI data handling), 2F (secret store, egress), 2E (four-eyes kinds), 2J (verification) |
| Related | ADR-003 (keys and the secret store), ADR-005 (hosting), ADR-010 (control plane); risks R-04, R-07, R-50 to R-54; assumptions A-12, A-55 to A-58 |
| Detail | [2I-billing.md](../phase2/2I-billing.md), sections I-2, I-3 and I-10 |

## Context

- **Owner decision (OQ-02, Q-21):** Stripe now, with other payment providers configurable later in the Admin Console. **Owner decision (Q-18):** AI providers are pluggable, including free models, and off by default.
- **The billing entity is in Pakistan now**, with UAE, US and UK entities planned in 1 to 3 years. Stripe does not onboard Pakistan-registered businesses (2I I-1.1). This is verified against secondary sources; Stripe's own page could not be fetched from this session, so it stays *verify*, A-55. "Stripe now" therefore needs a foreign entity. A merchant of record (MoR) or a local processor may serve the Pakistan entity, but this depends on each provider's KYB (A-56).
- **v0.2.5 behaviour:**
  - Stripe and Claude are hard-wired, with keys read from environment variables (`stripeFromEnv`, `claudeFromEnv`).
  - Tax is a per-country rule inside the rates module.
  - Invoice numbers come from a yearly counter.
  - There is one implicit seller.
- **The product needs:**
  - several billing entities;
  - two billing modes (Selvara as seller, or a MoR as seller);
  - provider changes without redesign;
  - provider credentials that a super admin manages without a deploy, never exposed and always under four-eyes approval;
  - a per-provider data-handling review for AI.

## Options considered

| ID | Option | Description |
|---|---|---|
| O1 | Hard-wire Stripe (status quo) plus a Stripe-supported foreign entity before launch | One provider, configured through environment variables |
| O2 | Adopt one MoR exclusively | The MoR handles checkout, subscriptions, tax and invoices, and Selvara mirrors them |
| O3 | **Provider abstraction:** `PaymentProvider` (mode `direct` or `merchant_of_record`), `TaxProvider`, `InvoiceNumbering`, `AiProvider` adapters in code, configured as data in `control.provider_configs` with secret references, under four-eyes | Several adapters; the route is chosen by configuration |
| O4 | An external billing platform (a subscription-billing SaaS) in front of any processor | Selvara integrates one billing SaaS that connects processors |

| Criterion | O1 Stripe only | O2 MoR only | O3 Abstraction | O4 Billing SaaS |
|---|---|---|---|---|
| Works for the Pakistan entity at launch | **No** (needs a foreign entity first) | Only if the MoR accepts it (A-56) | **Yes** (bank transfer adapter from day one; others as they qualify) | Depends on its processors |
| Meets "Stripe now" | Yes, with a foreign entity | No | Yes (adapter kept, activated when an eligible entity exists) | Partly |
| Meets "configurable later in the Admin Console" | No | No | **Yes** | Partly (configured in the vendor's console) |
| Indirect-tax burden | All on Selvara | Mostly on the MoR | Selectable per entity and mode | Varies |
| Lock-in | High | High | Low | High (plus another subprocessor) |
| Security of credentials | Environment variables, deploy to rotate, no four-eyes | Same | **Secret references, fingerprints, four-eyes on activation, change and live mode** | Vendor's console, outside Selvara's controls |
| Build cost | Lowest | Low | Medium (the interface plus two adapters at launch) | Medium, plus recurring vendor cost |
| AI pluggability | Not addressed | Not addressed | **Same registry and review model** | Not addressed |

## Decision (recommended)

**O3.**

| ID | Element |
|---|---|
| D7-1 | Interfaces `PaymentProvider`, `TaxProvider`, `InvoiceNumbering` and `AiProvider` (sketches in 2I I-3.2 and I-10.1). Adapters are code shipped through the pipeline. Configurations are data. |
| D7-2 | Launch adapters: payment `bank_transfer` and `stripe` (the existing code, refactored); tax `rules_table`; numbering `series` (gapless, per entity and series, allocated in the issuing transaction); AI `anthropic` (the existing client). Slots, built when a route qualifies: `mor_<provider>`, `psp_<provider>`, an external tax service, e-invoicing, other AI APIs and self-hosted open-weight models. |
| D7-3 | `control.provider_configs` holds `kind`, `adapter`, `billing_entity_id`, `environment`, non-secret `settings`, `secret_refs`, `secret_fingerprints`, `review_id`, `status` and `version`. Secrets live only in the secret store chosen under ADR-003, outside the database and its backups. Environment-variable provider keys are retired. |
| D7-4 | Lifecycle: draft, then test (sandbox call and webhook ping), then a four-eyes request (`provider.activate`, `provider.change`, `provider.live`; elevated requester and a different elevated approver; 24 h; rechecked on apply), then active. Disabling needs one elevated super admin; webhooks are still verified for 30 days after disable. |
| D7-5 | Billing mode is a property of the payment config. In `merchant_of_record` mode Selvara issues no customer tax invoice and mirrors the provider's documents. In `direct` mode Selvara issues invoices and credit notes and refuses to invoice a jurisdiction without an approved tax rule. |
| D7-6 | Webhooks: `POST /api/v1/hooks/billing/<config_ref>` (aligned with 2C C-09; rev P3); signature on the raw body, tolerance, dedupe by `(config, event id)`, mode and currency checks; mismatches go to the `unmatched` ledger for review. |
| D7-7 | AI: activation needs an `approved` `control.ai_provider_reviews` row (training use, retention, region, subprocessors, DPA, zero data retention, licence). Free hosted tiers that train on or retain inputs are rejected by rule. Tenants stay off by default and enable with four-eyes `ai.enable`. A provider change that alters training, retention or region asks for tenant approval again. The PII blocker runs before any adapter. |
| D7-8 | **The route for the Pakistan entity is not decided by this ADR.** It is an Admin Console configuration made through D7-4 once a route passes legal, tax and KYB checks. Until then: `bank_transfer` (owner decision OD-01). (rev P3) |
| D7-9 | Outbound provider calls (payment, tax, email, AI) that are not part of a user's synchronous request go through the queue with retry and dead-letter (2D D-90); synchronous calls use a bounded timeout and fail with a retryable error. Every outbound call leaves through the 2H egress design (allow-listed provider destinations, no internal addresses). (rev P3) |

## Consequences

| ID | Consequence |
|---|---|
| C7-1 | "Stripe now" is honoured as a ready adapter. It goes live when a Stripe-eligible Selvara entity exists. R-04 and R-50 stay visible until then. |
| C7-2 | Self-serve card payment is not available at launch unless a MoR or PSP qualifies. Annual and invoiced sales work from day one. |
| C7-3 | Typed control-plane tables replace the `platform_records` billing kinds (2I I-SD1). |
| C7-4 | "Void" becomes a full credit note to keep numbering intact (parity ledger, intended change). |
| C7-5 | Each new adapter needs its own contract tests (J-SEC-23 for webhooks), a subprocessor and DPA review, and an entry in the egress allow-list (2H egress design; 2F F-AB-14). (rev P3) |
| C7-6 | Operating cost: two people approve provider changes. This is consistent with the existing four-eyes model and A-08. |

## Security and privacy implications

| ID | Implication |
|---|---|
| SP7-1 | Card data stays out of Selvara: hosted checkout and portal redirects only, no card fields in any API (2I I-8). PCI DSS scope stays at the minimal outsourced level *(SAQ A eligibility, verify)*. |
| SP7-2 | Provider secrets are never in the database, backups, logs, approval payloads or responses. Fingerprints allow change detection without disclosure. Compromise of the database does not yield provider keys. |
| SP7-3 | Four-eyes on activation, change and live mode reduces the risk of payout diversion and refund fraud (R-54). Refunds go only to the original payment method through the provider. |
| SP7-4 | Payment providers and MoRs receive billing contact data (personal data: name, email, address) and become subprocessors. A MoR is also a seller to the customer, which needs a contractual and privacy-notice update (2G). |
| SP7-5 | AI providers are the main confidentiality exposure for tenant content. The review gate, default-off, tenant four-eyes, PII blocker, zero-retention preference and the extra condition for special-category tenants (2I I-10.7) address R-07. |
| SP7-6 | Webhook endpoints are unauthenticated by session. Signature verification, replay tolerance, dedupe and rate limits are mandatory, and failures are logged without payloads. |
| SP7-7 | Every compliance-related statement here (tax, PCI scope, payments regulation) is a **DRAFT** for qualified review. |

## Verification (Phase 4 checks)

| ID | Check | Evidence |
|---|---|---|
| V7-1 | No provider secret in any environment variable except the secret-store credential; no secret column in `control.provider_configs` | Config review; schema inspection; J-SEC-25 canary scan |
| V7-2 | Activation, change and live switch without a second elevated approver is refused; self-approval is refused; a stale config version is refused on apply | J-AUTHZ-26 over the `provider.*` kinds |
| V7-3 | Webhook: bad signature, replay, wrong mode or currency, duplicate event | J-SEC-23 per adapter |
| V7-4 | No card data accepted or stored | J-SEC-20 and J-SEC-21 (contract lint, PAN detector, database dump scan) |
| V7-5 | Invoice numbering is gapless under concurrent issue and rollback; credit notes have their own series; no renumbering | J-S02 concurrency test on `invoice_series` |
| V7-6 | No invoice is issued into a jurisdiction without an approved tax rule in `direct` mode; no Selvara customer invoice number is allocated in MoR mode | J-S03 |
| V7-7 | AI: no provider call while the tenant has AI off, while the provider review is not `approved`, or before the PII blocker | J-SEC-26 (network fake counts calls) |
| V7-8 | Switching a tenant's payment provider takes effect at the period boundary; old invoices keep their entity and provider | J-S03 |
| V7-9 | A Stripe adapter configured for an entity whose country Stripe does not support cannot be activated (a country capability check in adapter metadata) | J-S03 |
