# Risk register (seed)

| ID | Risk | Likelihood | Impact | Owner | Treatment | Status |
|---|---|---|---|---|---|---|
| R-01 | A single region blocks deals with banks, health or telecom buyers who need in-country hosting (GCC, South Asia) | High | High (commercial) | R-A | Accept for MVP; cell model allows regions later | **Accepted by owner (OQ-04)** |
| R-02 | One pooled login can switch to any tenant role, so a flaw in the application could reach another tenant (ADR-001, C1-01) | Low, with controls | Critical | R-B | One routing point, a role per tenant, row-level security as defence in depth, escape tests in CI | **Accepted by owner** with controls |
| R-03 | No team: approvals block, or one person ends up doing everything | Medium | High | R-A | Two named super admins; automate all non-approval work | Open (A-08) |
| R-04 | Payment provider unavailable for a Pakistan entity | High | High | R-A | Merchant of record or local provider via ADR-007 | Open (BL-01) |
| R-05 | The full MVP scope (all modules, DSAR, DPIA, ISO 27005, BYOK, SSO, SCIM, billing) is too large to deliver safely in one go | High | High | R-A | Ordered releases, each through the readiness gate | Open |
| R-06 | Supabase plan limits or feature gaps (A-09) | Medium | Medium | R-B | Check in Phase 2; ADR fallbacks | Open |
| R-07 | Free AI models keep or train on customer data | Medium | High | R-B | A recorded review per provider; off by default; personal-data check; four-eyes to enable | Open |
