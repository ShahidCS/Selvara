# Open Questions (after Phase 1)

Each question carries a recommendation. If you reply "accept", the recommendation becomes the decision and is recorded as an assumption or an ADR input.

| ID | Question | Why it matters | Recommendation |
|---|---|---|---|
| OQ-05 | ISO 27005 method: the asset-based model (asset, threat, vulnerability), the event-based model (scenario), or both? | Today only the event-based model exists; the brief asks for Asset, Threat and Vulnerability | **Both.** The tenant picks a method; asset-based links are optional on a risk. ISO/IEC 27005:2022 describes both approaches *(verify the wording)*. |
| OQ-06 | Should an external auditor see only what their engagement covers, for the engagement's dates (F1-01)? | Today an auditor reads the whole tenant | **Yes:** access limited to the engagement's scope, read-only, expiring automatically, and every view logged. Auditors may not acknowledge policies. |
| OQ-07 | Public Trust Center (F1-02): may anonymous visitors see control status by domain and the names of NDA-gated documents? Should an NDA be accepted per person or per company domain? | It is the main way data leaves a tenant | The tenant chooses per section what is public; NDA document names hidden until access is granted; **NDA accepted per person**; access refers to documents and viewers by id. |
| OQ-08 | RoPA: should each tenant keep its **own** editable register, separate from Selvara's own as a provider? | Today it is a fixed list shared by everyone | **Yes:** a per-tenant register, starting from a template, versioned. Selvara's own register is kept in the control plane. |
| OQ-09 | "No downgrade": do features that exist only in the demo count as scope? These are plans, entitlements, usage metering, automation rules, retention and legal holds, and Team settings (F1-03). | Decides the parity matrix | **Yes,** they count. Each one gets a server design in Phase 2; nothing the demo shows is dropped without your sign-off. |
| OQ-10 | Should platform staff see company admins' contact details and MFA status without a grant (F1-06)? | Data minimisation and the reach of platform staff | Keep only what operations need: admin contact for the account, and MFA status for reset requests. Every view is logged in the platform log, and the customer is told in the DPA. |
| OQ-11 | Payment (BL-01): may Phase 2I choose a **merchant of record** if Stripe cannot serve a Pakistan entity? | The launch billing route | **Yes:** keep Stripe as an adapter for the later UAE, US or UK entities. |
| OQ-12 | Confirm that two people will hold the roles R-A and R-B (A-08). No names needed. | Four-eyes approval cannot work with one person | Confirm. |
