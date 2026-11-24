# Phase 2B: Data classification, field-level encryption and retention

| | |
|---|---|
| Workstream | B (Data model) |
| Status | Proposed, Phase 2 design, revised in Phase 3. **DRAFT** pending legal and compliance review. |
| Companion of | [2B-data-model.md](2B-data-model.md) (table ids B-E.., retention classes B-RC.., encryption decision B-D18, search rule B-D21) |
| Related | ADR-003 (keys, workstream F/G), ADR-008, ADR-011, 2F F-D-12 (encryption classes), 2G G-5 (retention schedule) |
| Phase 3 | Encryption codes are now only **E0, E1, E2** (2F F-D-12; design-authority ruling DA-01); 2B's former codes (No, T, S, F, H, R, CP) are retired. Narrative free text moved to E1 (DA-01). Control-plane fields are E1 under the platform KEK (DA-05). Wrapped keys live only in `ks` (DA-04). Auditor-shared kinds follow DA-07. Retention class names are the B-RC names, used unchanged by 2G G-5. Rows changed in Phase 3 end with "(rev P3)". |
| Phase 5 | (rev P5) §3.1 erasure and offboarding route: one timing for the Auth user delete and the pseudonymisation of `control.identities` (together, at the G-RET-01 point; at once on an upheld erasure), aligned with 2D D-12a(7), D-79 and 2G G-RET-01, G-OFF-04, G-SAR-06; test cases 2J J-AUTHER-01 to J-AUTHER-10. |
| Phase 4 | Closes P4-A3-01 (the Supabase `auth` schema of `cp` is classified in §3.1 with class, encryption class, lawful basis, retention class and deletion method), P4-A3-08 (`control.tenant_export_jobs` for the final export FINAL-EXPORT), P4-A3-04 (E0 personal fields of a subject nulled on erasure and at the end of retention; `member_display` split from `platform_identity`) and P4-A3-03 (billing anchor). Rows changed in Phase 4 end with "(rev P4)". |

## 1. Scheme

### 1.1 Classes

| ID | Class | Code | Definition | Minimum handling |
|---|---|---|---|---|
| B-C01 | Public | P | Published on purpose by the tenant (after an explicit publish action) or by Selvara | Integrity only |
| B-C02 | Internal | I | Operational data of no harm if disclosed inside the tenant: ids, states, timestamps, settings | Tenant isolation |
| B-C03 | Confidential | C | Tenant business content: control design, risks, findings, contracts, vendor assessments, security posture | Isolation, access by permission, auditor scope by engagement |
| B-C04 | Personal data | PD | Information about an identified or identifiable person, including pseudonymous user ids, emails, IP addresses | C handling plus minimisation, erasure path, DSR locate |
| B-C05 | Special category | SC | GDPR Art. 9 / Art. 10 type data *(verify per jurisdiction)*, or a field designed to describe it about a person | PD handling plus field-level encryption, access logged |

Precedence: SC > PD > C > I > P. "C (may hold PD)" marks free text that is classed by its purpose but can carry personal data by accident (R-28, merged into R-34).

### 1.2 Encryption classes (2F F-D-12; the only codes used) (rev P3)

| ID | Code | Meaning |
|---|---|---|
| B-C10 | E0 | No field-level encryption; storage-level encryption at rest only (provider-managed). Ids, titles, names of records, refs, enumerations, states, dates, scores, counts. Searchable and sortable in SQL. (rev P3) |
| B-C11 | E1 | Field-level envelope encryption. In tenant schemas: the **tenant DEK** (2F F-K-02), crypto-shredded with the tenant. In `control` (section 3): the **platform DEK** (F-K-31) wrapped by the **platform KEK** (F-K-30) in the external KMS (DA-05). Narrative and descriptive free text that may hold personal or confidential data is E1 (DA-01). No plaintext index; search is decrypt-and-filter inside the tenant's own request (B-D21). (rev P3) |
| B-C12 | E2 | Field-level encryption with a **per-subject key** (2F F-K-03; one per member, workforce person or external party), wrapped in `ks.subject_key`. Crypto-shredded per person, which reaches backups within the `ks` window of 8 days (2B B-K05). Exact-match lookup by keyed blind index. (rev P3) |
| B-C13 | Files | File bytes are not columns: each file version is encrypted with its own per-file key (2F F-K-04) whose wrapped form lives in `ks.file_key`, referenced by `file_object.file_key_id` (DA-04). The table rows below write "per-file key" for file content. (rev P3) |
| B-C14 | One-way values | `_bidx`, `_hmac` and `_hash` columns are **E0** values that are one-way: SHA-256 for random tokens, keyed HMAC for low-entropy values (emails in `_bidx`, IPs in `_hmac`, API keys, audit-hash inputs under F-K-33). Written "E0 (hash)" below. (rev P3) |
| B-C15 | Secret references | `*_secret_ref` columns are **E0** pointers to the secrets manager; the secret is never in the database (2F F-11). Written "E0 (ref)" below. (rev P3) |
| B-C16 | Control-plane encryption | Retired as a separate code: control-plane fields are **E1 under the platform KEK** (B-C11, DA-05). (rev P3) |

### 1.3 Rules that apply to every table

| ID | Rule |
|---|---|
| B-C20 | Standard columns `id`, `tenant_id`, `ref`, `created_at`, `updated_at`, `version`, `deleted_at`, `legal_hold`, `retention_class`, every state and enum column, every date that is not about a person's life: **I, E0**. Not repeated below. (rev P3) |
| B-C21 | `created_by`, `updated_by` and every `*_user_id`, `*_by`, `*_person_id`, `user_ids[]` column: **PD (pseudonymous), E0**. The name behind the id is in `member_profile` or `person` (E2). Not repeated below. (rev P3) |
| B-C22 | Every `_enc` column is listed with its class (E1 or E2). Every `_bidx` and `_hmac` is **PD, E0 (hash)**. Key ids (`subject_key_id`, `file_key_id`, `*_subject_key_id`) are **I, E0**. (rev P3) |
| B-C23 | `record_history.before/after` inherits the classification of the row; encrypted fields stay ciphertext in it (B-H07). |
| B-C24 | The retention class (RC) is the row's default from 2B-data-model unless the field row says otherwise (column-level purge, B-RC30 to B-RC35). (rev P3) |
| B-C25 | Free text that accepts user input (descriptions, notes, reasons, comments, rationales, answers, bodies, scope text, encrypted JSON documents) is **E1**. Titles and names used for search and sorting stay **E0**. Full-text search in SQL covers E0 columns only; filtering on E1 text is decrypt-and-filter within the tenant's own request over bounded pages, with no plaintext index (2B B-D21, 2F F-D-12). Direct identifiers of natural persons are **E2**. The input form still runs the PII detector (`lib/pii.ts` today) and warns. (rev P3, DA-01) |
| B-C26 | Nothing classed PD or SC may appear in: `ops` messages, `audit_log_entry.detail` (E0), `notification.title/body`, application logs, error messages, webhook payloads, AI prompts with masking on (workstream F/G check every store, discovery §6 condition 3). Reasons and before/after summaries of an audit entry go to `details_enc` (E1). (rev P3) |
| B-C27 | The registry of this file is machine-readable in the repository (one entry per column: class, encryption class, retention class); CI fails on a column with no entry (B-V11), on an encryption code other than E0, E1 or E2, or on a retention class not defined in 2B §7.1 (B-RC01 to B-RC38). The registry covers the Supabase-managed `auth` schema of `cp` (§3.1) as well as Selvara's own schemas: CI reads `auth` columns from the catalog and fails on one with no entry, so a Supabase upgrade that adds a personal-data column is caught (P4-A3-01). (rev P4) |
| B-C28 | Wrapped key material is never stored in a tenant schema, `ref`, `ops` or `control`; only key ids and versions (DA-04, B-P24). (rev P3) |
| B-C29 | **Data minimisation in Supabase Auth (P4-A3-01).** Selvara writes nothing into `auth.users.raw_user_meta_data` or `raw_app_meta_data` and adds no custom JWT claims: the only identifier Selvara relies on is the Auth user id. Display name, tenant, role and membership data live only in `control` (E1 where personal). SAML attribute mapping is limited to the email (the NameID) so `auth.identities.identity_data` holds no further claims *(verify that Supabase SAML attribute mapping can be restricted this way, A-41)*; phone sign-in and phone MFA are disabled, so `auth.users.phone` stays null. A CI check on staging and a weekly production probe count `auth.users` rows whose metadata holds keys other than those Supabase writes itself (`provider`, `providers`, `sub`, `email`, `email_verified`, `phone_verified` *(verify the exact list)*) and alert on any. Fallback if Supabase writes further claims that cannot be switched off: the probe lists them, they are classed here as PD E0 under `platform_identity`, and they leave with the user at deletion (§3.1). (rev P4) |

## 2. Tenant schema, per entity

Column: **Field** → **Class** · **Enc** · **RC** (blank = row default) · note. Anchor = the event the row's retention runs from. Physical E1 and E2 columns carry the `_enc` suffix in 2B-data-model §6; this file names them by that physical name.

### M01 Settings

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `tenant_settings` (offboarding) | lockout, password, upload, SLA, review-cycle settings | C | E0 | | security configuration of the tenant |
| | `brand_preset`, `data_region` | I | E0 | | |
| `trusted_network` (offboarding) | `cidr` | C | E0 | | office network ranges; not personal unless a single home address (warning in UI) |
| | `label_enc` | C (may hold PD) | E1 | | (rev P3) |
| `tenant_role`, `tenant_role_permission` (offboarding) | `name`, `description`, `permission_code`, `scope` | I | E0 | | |
| `member_profile` (membership end) | `display_name_enc` | PD | E2 | `member_display` (B-RC29) | kept for audit attribution as "Former member" until the class ends or an upheld erasure (rev P4) |
| | `email_enc` | PD | E2 | column purge B-RC38: 30 days after membership end | not needed for attribution once the membership has ended (rev P4) |
| | `email_bidx` | PD | E0 (hash) | column purge B-RC38 | (rev P4) |
| | `job_title`, `department` | PD | E0 | column purge B-RC38: 30 days after membership end; nulled at once on erasure (B-DL06) | low sensitivity, used for filters while the membership is live; a "Former member" row holds no E0 personal field (P4-A3-04) (rev P4) |
| | `subject_key_id` | I | E0 | | id of the key in `ks.subject_key`; key shredded at the end of `platform_identity` or on upheld erasure (rev P3) |
| `ref_counter` | all | I | E0 | | |

`tour_prefs` moved to `control.identities` (section 3; X1-26). (rev P3)

### M02 Frameworks

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `framework_scope` (retirement) | `in_scope`, dates | C | E0 | | which certifications a tenant pursues is commercially confidential |
| `custom_framework`, `custom_requirement` (retirement) | `name`, `title` | C | E0 | | |
| | `guidance_enc` | C | E1 | | may hold licensed text the tenant pasted (R-24) (rev P3) |
| `requirement_status` (retirement) | `applicability`, `implementation` | C | E0 | | |
| | `na_reason_enc` | C (may hold PD) | E1 | | (rev P3) |
| `control_mapping` | all | C | E0 | | |
| `content_pin`, `content_upgrade` | all; `diff` | I | E0 | | ids and counts only |

### M03 Controls

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `control` (retirement) | `title`, `domain`, `status` | C | E0 | | |
| | `description_enc` | C (may hold PD) | E1 | | (rev P3) |
| | `external_ticket_key` | I | E0 | | |
| `control_test` (retirement) | `name`, `logic`, `cadence` | C | E0 | | test logic reveals the security posture; configuration, not narrative |
| `test_run` (run time) | `result`, counts | C | E0 | | |
| | `items_enc` | PD | E1 | column purge 13 months (B-RC30) | names employee accounts from integrations |
| | `note_enc` | C (may hold PD) | E1 | | (rev P3) |
| `control_exception` (closure) | `reason_enc`, `compensating_enc` | C (may hold PD) | E1 | | (rev P3) |
| `control_attestation` | `statement_enc` | C | E1 | | (rev P3) |
| `control_test_link`, `control_link` | all | C | E0 | | |

### M04 Evidence

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `evidence` (superseded or deleted) | `name` | C | E0 | | |
| | `description_enc` | C (may hold PD) | E1 | | (rev P3) |
| | `type`, `valid_from`, `expires_on`, `review_state` | I | E0 | | |
| | `delete_reason_enc` | C (may hold PD) | E1 | | (rev P3) |
| `evidence_version` | `note_enc` | C (may hold PD) | E1 | | (rev P3) |
| | `manifest_sha256` | I | E0 (hash) | | |
| | files (via `file_object`) | C, may hold PD or SC | per-file key | | screenshots, exports and records can hold employee or customer data (AS gap 7) |
| `evidence_link` | all | C | E0 | | |
| `evidence_review` | `note_enc` | C (may hold PD) | E1 | | (rev P3) |

### M05 Policies

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `policy` (last version superseded) | `name`, `category`, review dates | I | E0 | | |
| `policy_version` (superseded) | `body_enc` | C | E1 | | the copy published on the Trust Center is a `trust_document` (P) (rev P3) |
| | `change_note_enc` | C (may hold PD) | E1 | | (rev P3) |
| | `body_sha256` | I | E0 (hash) | | |
| `policy_approval` | `reason_enc` | C (may hold PD) | E1 | | (rev P3) |
| `policy_attestation` | `attested_at`, `channel` | PD | E0 | | an individual's acknowledgement |
| `policy_exception` | `reason_enc` | C (may hold PD) | E1 | | (rev P3) |
| `policy_remark` (resolved) | `section` | C | E0 | | "My remarks" (OD-05, X2-18) (rev P3) |
| | `text_enc`, `resolve_reason_enc` | C (may hold PD) | E1 | | (rev P3) |

### M06 Risk

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `risk_method_settings`, `risk_criteria` | all | C | E0 | | appetite and thresholds are confidential governance data |
| `asset` (retirement) | `name`, `location`, CIA ratings, `business_value` | C | E0 | | |
| | `holds_personal_data`, `holds_special_category` | C | E0 | | flags, not personal data |
| `threat`, `vulnerability` (retirement) | `name`, `cve_id`, `severity` | C | E0 | | |
| | `description_enc` | C | E1 | | unremediated vulnerabilities are highly confidential (rev P3) |
| `risk` (closure) | `title` | C | E0 | | |
| | `description_enc` | C (may hold PD) | E1 | | (rev P3) |
| | scores, `category`, `register`, `jurisdiction` | C | E0 | | |
| `risk_asset`, `risk_threat`, `risk_vulnerability`, `interested_party_risk` | all | C | E0 | | link rows |
| `risk_treatment`, `treatment_action` | cost, dates | C | E0 | | |
| | `plan_enc`, `text_enc`, `cancel_reason_enc` | C (may hold PD) | E1 | | (rev P3) |
| `risk_acceptance` | `rationale_enc`, `compensating_enc`, `invalidated_reason_enc` | C | E1 | | (rev P3) |
| | `board_ref`, `board_date`, `board_body` | C | E0 | | Board minutes as evidence files (per-file key) |
| `risk_review` | `note_enc` | C (may hold PD) | E1 | | (rev P3) |
| `interested_party` | `party`, `location` | C | E0 | | organisations or roles (A-32); PD if a person is named |
| | `requirement_enc` | C | E1 | | (rev P3) |
| `risk_snapshot` | `content` | C | E0 | | holds ids and scores, not names or narrative text; the auditor's only view of risks (DA-07) (rev P3) |
| `risk_import` | `rows_enc` | C, holds PD (owner names in the file) | E1 | column purge 30 days (B-RC33) | the uploaded file has a per-file key (rev P3) |

### M07 Issues

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `issue` (closure) | `title` | C | E0 | | |
| | `description_enc`, `root_cause_enc`, `corrective_action_enc`, `verification_note_enc` | C (may hold PD) | E1 | | (rev P3) |
| `issue_task` | `text_enc` | C (may hold PD) | E1 | | (rev P3) |
| `issue_link` | all | C | E0 | | |

### M08 Audits

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `audit` (complete) | `name`, dates | C | E0 | | |
| | `scope_enc`, `close_reason_enc` | C | E1 | | (rev P3) |
| | `auditor_firm` | C | E0 | | organisation, not a person |
| `audit_shared_item` | all | C | E0 | | defines what the auditor may read; kinds `control`, `evidence` (files included by default), `policy`, `risk_snapshot` only (DA-07) (rev P3) |
| `auditor_access` | window, `ended_by_kind` | PD | E0 | | an individual's access record; auditors receive no member list (DA-07) (rev P3) |
| `pbc_request`, `information_request` | `item_enc`, `response_enc` | C (may hold PD) | E1 | | (rev P3) |
| `finding` | `title` | C | E0 | | |
| | `recommendation_enc`, `rejected_reason_enc` | C | E1 | | (rev P3) |
| `audit_test` | `result`, `sample_size` | C | E0 | | |
| | `note_enc` | C | E1 | | (rev P3) |

### M09 Vendors

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `vendor` (offboarded) | `name`, `category`, `processing_countries` | C | E0 | | P for the sub-processor list once `is_subprocessor` and gate `approved` |
| | `service_description_enc` | C | E1 | | decrypted by the API for the public sub-processor list (rev P3) |
| | `tier`, `score`, `gate` | C | E0 | | |
| | `gate_reason_enc` | C | E1 | | (rev P3) |
| | logo (`file_object`) | P | per-file key | | |
| `vendor_contact` (relationship end) | `name_enc`, `email_enc`, `phone_enc` | PD | E2 | `external_contact` | third-party people |
| | `role_title` | PD | E0 | | |
| `vendor_certificate` | type, issuer, dates | C | E0 | | |
| | `waiver_reason_enc` | C | E1 | | (rev P3) |
| `vendor_assessment` | `score`, `outcome`, `assessor_org` | C | E0 | | |
| `vendor_finding` | `title` | C | E0 | | |
| | `close_reason_enc` | C | E1 | | (rev P3) |
| `vendor_request` | `vendor_name` | C | E0 | | |
| | `reason_enc` | C | E1 | | (rev P3) |
| `vendor_portal_invite` (terminal state) | `token_hash` | I | E0 (hash) | `transient` | bound to one `vendor_assessment` (X2-33) (rev P3) |

### M10 Questionnaires

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `questionnaire_template`, `template_question` | all | C | E0 | | |
| `questionnaire` | `customer_org` | C | E0 | | |
| | `clarify_note_enc` | C | E1 | | (rev P3) |
| `question_response` | `answer` (enum), `question_text` | C | E0 | | |
| | `answer_text_enc`, `comment_enc` | C (may hold PD) | E1 | | vendor's answers about its own security (rev P3) |
| | attachment (`file_object`) | C | per-file key | | |
| `answer_library` | `question` | C | E0 | | |
| | `answer_enc` | C | E1 | | P when `published_to_trust` (decrypted by the API for the Trust Center) (rev P3) |
| `kb_document` | `title` | C | E0 | | |
| | file | C | per-file key | | |

### M11 Trust Center

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `trust_settings` | `public_ref`, `public_page_on` | P | E0 | | |
| | `blocked_domains` | C | E0 | | |
| `trust_section` | `title`, `body` | P when published and `visibility = public`; C otherwise | E0 | | written for publication |
| `trust_document` | `name`, `description` | P (public) or C (on request, NDA) | E0 | | NDA document names are C (F1-02); written for publication |
| | file | as `access` | per-file key | | |
| `trust_account` (last activity) | `company_name`, `domain` | C | E0 | `external_contact` | organisation; no direct identifiers of persons (2G G-D-02) (rev P3) |
| | `revoke_reason_enc` | C | E1 | | (rev P3) |
| `trust_viewer` (last activity) | `email_enc` | PD | E2 | `external_contact` | |
| `trust_nda_acceptance` | `accepted_at` | PD | E0 | `external_contact` | |
| | `ip_hmac` | PD | E0 (hash) | `external_contact` | |
| | `signer_name_enc` | PD | E2 | `external_contact` | the viewer's subject key; name accepted by 2C C-PU-05 (X1-27) (rev P3) |
| `trust_grant`, `trust_access_request` | `reason_enc`, `note_enc` | C (may hold PD) | E1 | | (rev P3) |
| `trust_subscription` | `unsubscribe_token_hash` | I | E0 (hash) | | |
| `trust_chat` (asked) | `question_enc` | C (may hold PD) | E1 | `operational` | anonymous free text |
| | `visitor_domain` | PD | E0 | | |
| `trust_update` | `title`, `body` | P | E0 | | |
| `visitor_session` (ended) | `email_enc` | PD | E2 | column purge at end (B-RC34) | lifetime at most 60 minutes (X1-28) (rev P3) |
| | `code_hash` | I | E0 (hash) | | |
| | `ip_hmac` | PD | E0 (hash) | | |

### M12 People and access

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `person` (left) | `display_name_enc`, `email_enc` | PD | E2 | | members, workforce and contractors |
| | `job_title`, `department`, `manager_person_id`, `start_on`, `end_on`, `employment_status` | PD | E0 | | employment data; HR-adjacent, minimised (no salary, no reasons for leaving). On upheld erasure, and when the row's `access` class ends, `job_title`, `department`, `manager_person_id`, `start_on` and `end_on` are nulled and `employment_status` is set to `left` (B-DL06), so the pseudonymous row cannot re-identify the person (P4-A3-04) (rev P4) |
| | `device_posture_enc` | PD | E1 | | device posture summary from integrations, fed by D-69 (X1-24) (rev P3) |
| `contractor` | `company_name`, `contract_end_on` | PD | E0 | | the contractor's identity is in `person` (E2) |
| `system` | `name`, `is_privileged`, `data_classification` | C | E0 | | |
| | `description_enc` | C | E1 | | (rev P3) |
| `access_grant` | `level`, dates | PD | E0 | | who can access what |
| | `revoke_reason_enc` | PD | E1 | | (rev P3) |
| `access_request` | `reason_enc`, `decision_reason_enc` | PD (may hold more) | E1 | | (rev P3) |
| `access_review`, `access_review_item` | decisions | PD | E0 | | |

### M13 AI governance

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `ai_system` (archived) | `name`, `model`, `provider_name`, tiers, EU class | C | E0 | | |
| | `purpose_enc`, `dismissed_reason_enc` | C | E1 | | (rev P3) |
| | `data_reached_enc` | C (may describe SC processing) | E1 | | describes categories, not people (rev P3) |
| `ai_assessment` | `summary_enc` | C (may describe SC) | E1 | | FRIA and DPIA screening content |
| | `answers_enc`, `return_reason_enc` | C | E1 | | encrypted JSON (rev P3) |
| `ai_signal` | `text_enc` | PD, may hold SC | E1 | | quotes context blocked by the PII filter |
| | `recommendation_enc`, `dismissed_reason_enc` | C | E1 | | (rev P3) |

### M14 Privacy

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `processing_activity` (retired) | `name`, `role`, keys of lawful basis and categories, `transfer_countries`, `transfer_mechanism` | C | E0 | | the tenant's register, may be shown to regulators |
| | `purpose_enc`, `recipients_enc`, `retention_text_enc`, `toms_enc` | C | E1 | | descriptive fields (rev P3) |
| `processing_link` | all | C | E0 | | |
| `dpia` (superseded) | `screening_rationale_enc`, `description_enc`, `necessity_enc`, `risks_enc`, `measures_enc`, `dpo_advice_enc` | C (may describe SC) | E1 | | |
| | `residual_risk`, `prior_consultation_required`, `consultation_ref` | C | E0 | | |
| `data_subject_request` (closed) | `subject_name_enc`, `subject_email_enc`, `subject_identifiers_enc`, `agent_details_enc` | PD | E2 | | the data subject's own key |
| | `subject_email_bidx` | PD | E0 (hash) | | |
| | `request_type`, dates, `status`, `outcome` | PD | E0 | | the existence of a request is personal data |
| | `refusal_reason_enc`, `extension_reason_enc` | PD | E1 | | (rev P3) |
| | `special_category_involved` | SC (flag) | E0 | | the flag reveals that SC exists, not what it is |
| | response package (`file_object`) | PD, may hold SC | per-file key | | |
| `dsr_task` | `result_note_enc` | PD | E1 | | |
| | `located_count` | PD | E0 | | |
| `retention_rule`, `legal_hold` | `basis_enc`, `changed_reason_enc`, `matter_enc`, `reason_enc` | C | E1 | | a legal matter can be highly sensitive; permission-limited (rev P3) |

### M15 Commitments

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `contract` (expiry) | `counterparty_org`, `title` | C | E0 | | |
| | file | C | per-file key | | |
| `commitment` | `name` | C | E0 | | |
| | `detail_enc`, `review_note_enc` | C | E1 | | (rev P3) |
| `incident` (closed) | `summary_enc`, `outcome_enc` | PD, may hold SC | E1 | | breach descriptions; affected people are referenced by `person` id only (2G G-D-02) (rev P3) |
| | breach flags, notification times | C | E0 | | |

### M16 to M18

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `report_schedule` | `external_recipients_enc` | PD | E2 | | each external address under its own subject key (`external_recipient_subject_key_ids`); purged when the schedule is removed (X1-32, 2G G-D-03) (rev P3) |
| | `recipient_user_ids` | PD | E0 | | |
| `report_run` | `filters`, `row_count`, `watermark_ref`, `contains_personal_data` | I | E0 | | (rev P3) |
| | output file | C (may hold PD) | per-file key | output file purged after 30 days when `contains_personal_data` (B-RC35) | (rev P3) |
| `integration` | `label`, `config` | C | E0 | | identifiers of cloud accounts and tenants |
| | `config_contact_enc` | PD | E2 | | IdP admin email, under that contact's subject key (`config_contact_subject_key_id`, X1-31) (rev P3) |
| | `credential_secret_ref` | C | E0 (ref) | | |
| | `last_error_enc`, `disconnected_reason_enc` | C | E1 | | providers' error text, sanitised of tokens (rev P3) |
| `integration_sync_run` | counts, `error` | I | E0 | `ops_medium` (B-RC28) | (rev P3) |
| `integration_account` (disconnect) | `display_name_enc`, `email_enc` | PD | E2 | | employee data from identity providers (F1-08) |
| | `mfa_enabled`, `is_admin`, `last_login_at`, `status` | PD | E0 | | the whole row is hard-deleted on upheld erasure of the matched person (B-DL06) and on disconnect (P4-A3-04) (rev P4) |
| `api_key` | `prefix`, `key_id`, `scopes`, `ip_allowlist`, `pepper_version` | C | E0 | | (rev P3) |
| | `key_hmac` | C | E0 (hash) | | |
| `webhook` | `url` | C | E0 | | |
| | `signing_secret_ref` | C | E0 (ref) | | |
| `webhook_delivery` | all | I | E0 | `ops_short` (B-RC27) | payload not stored (rev P3) |
| `idempotency_record` | `request_sha256` | I | E0 (hash) | `transient` | (rev P3) |
| | `response_body_enc` | as the response | E1 | `transient` (24 h) | (rev P3) |

### M19 to M26

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `ai_tenant_settings` | all | C | E0 | | `provider_config_id` points to a control-plane row holding only secret references |
| `agent` | all | C | E0 | | |
| `agent_run` | `draft_enc` | C (may hold PD) | E1 | column purge 13 months (B-RC31) | |
| | `change_summary_enc`, `decided_reason_enc` | C (may hold PD) | E1 | | (rev P3) |
| | tokens, model | I | E0 | | |
| `agent_change` | `proposed_enc` | as the target table | E1; fields of an E2 target under that subject's key | | never plaintext of an encrypted target field (rev P3) |
| `notification` | `title`, `body` | I | E0 | `operational`, capped at 12 months (G-RET-22) | B-C26: no PD of other people (rev P3) |
| `notification_pref` | all | PD | E0 | | preferences of one person |
| `approval` | `title` | C | E0 | | |
| | `payload_enc` | C, PD for sensitive kinds | E1 | | encrypted JSON for every kind; the only payload column (X1-02) (rev P3) |
| | `decided_reason_enc` | C (may hold PD) | E1 | | (rev P3) |
| `approval_vote` | `reason_enc` | C (may hold PD) | E1 | | (rev P3) |
| `delegation` | `reason_enc` | C (may hold PD) | E1 | | (rev P3) |
| `audit_log_entry` | `action`, `category`, `target_*`, `outcome`, `refusal_code`, `detail`, `prev_hash`, `hash` | I | E0 | | `detail`: ids and codes only, no PD (rev P3) |
| | `actor_id`, `on_behalf_of` | PD | E0 | | pseudonymous ids (OD-10) (rev P3) |
| | `ip_enc` | PD | E1 | column purge 1 year (B-RC32) | |
| | `ip_prefix` | PD | E0 | | /24 or /48 (rev P3) |
| | `pd_enc` | PD | E2 | column purge 1 year (B-RC32) | rare: values a regulator requires in the log |
| | `details_enc` | C (may hold PD) | E1 | column purge 1 year (B-RC32) | reasons and before/after summary (X1-09) (rev P3) |
| | `ip_hmac`, `pd_hmac`, `details_hmac` | PD | E0 (hash) | | the only form in which personal fields enter the hash input (B-D17, DA-03) (rev P3) |
| `audit_anchor` | all | I | E0 | | |
| `record_history` | `before`, `after` | as the source row | as the source row | as the source row | |
| `file_object` | `original_name_enc` | C (may hold PD) | E1 | | |
| | `path`, `sha256`, `size_bytes`, `mime_type`, `scan_state` | I | E0 | | paths carry `tkey` and ids only |
| | `file_key_id`, `key_version` | I | E0 | | reference to `ks.file_key`; no wrapped key in the cell (DA-04) (rev P3) |
| | bytes | as the owner | per-file key | | |
| `automation_rule`, `automation_run` | all | I | E0 | | |

## 3. Control plane and other schemas

In `control`, **E1 means the platform DEK (F-K-31) wrapped by the platform KEK (F-K-30)** in the external KMS (DA-05); blind indexes use F-K-32. (rev P3)

| Entity | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `control.tenants` | `name`, `customer_ref`, `region`, `status` | C | E0 | `financial` after closure | `tkey` is I and random (S1) |
| | `route_mac` | I | E0 (hash) | | routing integrity (X2-28) (rev P3) |
| `control.identities` | `email_enc`, `display_name_enc` | PD | E1 | `platform_identity` | platform KEK (DA-05) (rev P3). The same email is also held in plaintext by Supabase Auth in `auth.users` and `auth.identities` (E0, §3.1); erasure and offboarding reach both stores (rev P4) |
| | `email_bidx` | PD | E0 (hash) | | HMAC blind index for sign-in lookup (F-K-32) (rev P3) |
| | `home_tenant_id`, `tour_prefs` | I | E0 | | (rev P3) |
| `control.memberships` | all (incl. `source`, `expires_at`, `external`) | PD | E0 | `platform_identity` (B-RC19): an ended membership row is hard-deleted 30 days after `ended_at`; attribution after that comes from the tenant's `member_profile` (`member_display`) and the audit logs (P4-A3-04) | (rev P4) |
| `control.invitations` | `email_enc` | PD | E1 | `transient` | (rev P3) |
| | `token_hash` | I | E0 (hash) | | |
| `control.join_requests` | `email_enc`, `display_name_enc` | PD | E1 | `rejected_request` if rejected, else `transient` after decision | (rev P3) |
| | `email_bidx`, `company_code_hash` | PD | E0 (hash) | | (rev P3) |
| `control.sessions`, `control.auth_throttle` | `ip_enc`, device | PD | E1 | `sign_in_record` (B-RC21) | (rev P3) |
| | `ip_hmac`, `ip_prefix` | PD | E0 (hash); E0 | `sign_in_record` | (rev P3) |
| `control.account_notices` | `body_enc` | PD | E1 | `sign_in_record` | (rev P3) |
| `control.recovery_codes`, `control.passkeys` | hashes, public keys | C | E0 (hash); E0 | `account_credential` (B-RC22) | (rev P3) |
| `control.subscriptions` | `contact_enc`, `address_enc` | PD | E1 | `financial` | billing contact (F1-07: no card data ever) (rev P3) |
| `control.invoices`, `invoice_lines`, `ledger_entries`, `credit_notes`, `payments` (2I) | amounts, tax, provider refs | C | E0 | `financial` | anchor: the record's creation date (invoice and credit-note issue date, ledger or payment entry date), OQ-25 (rev P4) |
| `control.invoices` | `rendered_snapshot_enc` (buyer name, address, tax ids) | PD (sole traders) | E1 | `financial` | 2I I-6.3.2 (rev P3) |
| `control.provider_events` | `payload_enc` | PD (billing contact) | E1 | `financial` | (rev P3) |
| `control.billing_entities`, `price_lists`, `invoice_series`, `plan_change_requests`, `fx_rates`, `tax_rules`, `entitlement_overrides` | all | C | E0 | `financial` | Selvara's own commercial data (rev P3) |
| `control.usage_meters`, `control.usage_event_receipts` | counts, event ids | I | E0 | `financial`; receipts hard-deleted after 35 days | aggregated, no content (rev P3) |
| `control.plans`, `plan_entitlements`, `trial_policies` | all | I | E0 | `platform_lifetime` (B-RC23) | (rev P3) |
| `control.provider_configs`, `control.ai_provider_reviews` | settings, secret references, review records | C | E0; E0 (ref) | `platform_lifetime` | never key material (rev P3) |
| `control.key_registry` | key ids and versions, state, dates | C | E0 | `tenant_lifetime`; destroyed-key rows `accountability` (B-RC24) | never key material (rev P3) |
| `control.tenant_cells`, `tenant_schema_versions`, `tenant_roles` | all | I | E0 | `platform_lifetime`; `tenant_lifetime` for the per-tenant rows | connection secrets by reference only (rev P3) |
| `control.platform_staff` | `display_name_enc`, `email_enc` | PD | E1 | `staff_record` (B-RC25) | (rev P3) |
| `control.platform_roles`, `platform_role_permissions` | names, permission codes | I | E0 | `platform_lifetime` | (rev P3) |
| `control.elevations` | `reason_enc` | PD | E1 | `staff_record` | (rev P3) |
| | `ticket_ref`, window | PD | E0 | `staff_record` | (rev P3) |
| `control.platform_approvals` | `payload` | C | E0 | `staff_record` | ids and codes only (rev P3) |
| | `payload_enc` | PD | E1 | `staff_record` | sensitive kinds: first-admin email, MFA-reset identity checks (rev P3) |
| `control.platform_approval_votes` | `reason_enc` | C (may hold PD) | E1 | `staff_record` | (rev P3) |
| `control.support_grants`, `support_sessions` | ids, windows | PD | E0 | `staff_record` | (rev P3) |
| | `reason_enc` | C | E1 | `staff_record` | (rev P3) |
| `control.break_glass_events` | `reason_enc`, `review_note_enc` | PD | E1 | `staff_record` | (rev P3) |
| `control.platform_audit_log` | `action`, `target_*`, `outcome`, `detail`, hashes | I | E0 | `audit_log` | (rev P3) |
| | actor ids | PD | E0 | `audit_log` | (rev P3) |
| | `ip_enc`, `details_enc` | PD | E1 | column purge 1 year (B-RC32) | hash input uses `ip_hmac`, `details_hmac` (B-D17) (rev P3) |
| `control.platform_audit_anchor` | all | I | E0 | `audit_log` | (rev P3) |
| `control.support_questions`, `support_messages` | `subject_enc`, `body_enc` | C (may hold PD) | E1 | `support` (B-RC26): 2 years after closure | Selvara is controller (X1-37) (rev P3) |
| `control.ropa_selvara` | all | C | E0 | `platform_lifetime` | (rev P3) |
| `control.sso_connections`, `control.sso_domains` | IdP metadata, certificates, domains | C | E0 | `tenant_lifetime` | (rev P3) |
| | `verification_token_hash` | I | E0 (hash) | `tenant_lifetime` | (rev P3) |
| `control.scim_tokens` | token hash | C | E0 (hash) | `tenant_lifetime` | (rev P3) |
| `control.api_key_routes`, `portal_link_routes` | key or link id, tenant id, status, expiry | I | E0 | hard-deleted on revocation; `transient` | no secret (rev P3) |
| `control.idempotency_records` | `request_sha256` | I | E0 (hash) | `transient` (24 h) | (rev P3) |
| | `response_body_enc` | as the response | E1 | `transient` (24 h) | control-plane routes only (rev P3) |
| `control.deletion_certificates` | all | C | E0 | `accountability` (B-RC24) | evidence of erasure; holds no deleted content (rev P3) |
| `control.tenant_export_jobs` (FINAL-EXPORT, 2D D-12b) | `tenant_id`, `state`, `generation`, `requested_by`, `recipient_identity_id`, `manifest_sha256`, `manifest_signature`, `table_counts` (per-table row counts), `file_count`, `bundle_bytes`, `schema_version`, `generated_at`, `window_ends_at`, `link_expires_at`, `downloaded_at`, `receipt_outcome`, `receipt_confirmed_by`, `receipt_confirmed_at` | PD (pseudonymous ids) | E0 | `accountability` (B-RC24) | evidence that the return obligation was met before deletion; holds no tenant content and no key (rev P4) |
| | `passphrase_enc` | C (secret) | E1 | nulled at reveal, at supersession by a new generation, or at window end, whichever is first | one-time bundle passphrase held only until the recipient reveals it once (2C C-M01-23); never logged, never returned twice (rev P4) |
| | `link_token_hash`, `download_token_hash` | I | E0 (hash) | nulled at use or expiry | single-use email link (7 days) and download token (rev P4) |
| `control.ref_content_releases` | all | I | E0 | `platform_lifetime` | (rev P3) |
| `ref.*` | all | P or I | E0 | not subject to retention (no PD, B-RF12) | (rev P3) |
| `ops.*` | job ids, `tkey`, counters | I | E0 | `transient` or `operational` (2B B-O01 to B-O06) | no PD, no free text (B-P04) (rev P3) |
| `ks.*` | wrapped keys, key ids | I | wrapped key material (outside the E-classes) | deleted per 2B B-K01 to B-K04 | 2F F-D-05, ADR-003; `ks` is not part of any tenant or control export (rev P3) |

### 3.1 Supabase Auth schema `auth` in `cp` (rev P4, closes P4-A3-01)

Supabase Auth runs only in `cp` (2A A-D-02) and is the credential verifier during sign-in only (2E E-10); Selvara's own session is `control.sessions`. The `auth` schema is **Supabase-managed**: Selvara cannot add field-level encryption to it. Every field below is therefore **E0 at the application layer**, protected only by the provider's storage encryption at rest (Supabase disk encryption *(verify scope and key ownership; owner verifies vendor facts before the gate)*). This is stated in the RoPA (2G G-2.1), the DPA security annex (G-DPA-06) and the DPIA (G-DR-16). The table names and columns follow the Supabase Auth schema as documented *(verify against the deployed Auth version; the B-C27 catalog check catches any column not listed)*.

Lawful basis references 2G G-2.1: **RC-01** = G-RC-01 account and identity management (Art. 6(1)(b) for the contracting customer's account holder; Art. 6(1)(f) for the customer's staff users); **RC-02** = G-RC-02 security logging and abuse prevention (Art. 6(1)(f); 6(1)(c) where a law requires security records *(verify)*); **RC-07** = G-RC-07 trials (Art. 6(1)(b) / 6(1)(f)). All DRAFT pending counsel.

Deletion methods: **ADM** = Auth admin API user delete (`auth.admin.deleteUser`, hard delete, not soft delete *(verify that a hard delete cascades to `identities`, `sessions`, `refresh_tokens`, `mfa_factors`, `mfa_challenges`, `mfa_amr_claims` and `one_time_tokens`; fallback: the purge job deletes the dependent rows by `user_id` in the same run and verifies zero remain)*), run by the identity worker (2D D-79) from `console`-owned code through a service credential held in the secrets manager, never by the `app` deployment. **APJ** = the `auth` purge job (2D D-80a): a `SECURITY DEFINER` function owned by a dedicated `auth_purger` role that may delete only the listed `auth` tables, batch ≤1,000 rows, writes one `control.platform_audit_log` entry per table per run (counts only). Fallback if Supabase does not allow a custom role to delete in `auth` *(verify)*: the job runs with the `cp` service role from the same `console`-owned worker, under the same function body and audit entry.

| Table | Field | Class | Enc | RC | Lawful basis | Deletion method | Note |
|---|---|---|---|---|---|---|---|
| `auth.users` | `id` | PD (pseudonymous) | E0 | `platform_identity` (B-RC19) | RC-01 | ADM | the only identifier Selvara relies on (B-C29); kept as the pseudonymous id in `control.identities` and audit logs after the Auth row is deleted |
| | `email`, `email_confirmed_at`, `email_change`, `email_change_*` | PD | E0 (plaintext at rest, provider disk encryption only) | `platform_identity` | RC-01 | ADM | duplicates `control.identities.email_enc` (E1); the plaintext copy here is why 2G G-DC-01 no longer claims E1 for every store |
| | `phone`, `phone_confirmed_at`, `phone_change*` | PD | E0 | `platform_identity` | RC-01 | ADM | always null: phone sign-in and phone MFA disabled (B-C29); the probe alerts on a non-null value |
| | `encrypted_password` | C (credential) | E0 (hash; bcrypt by Supabase *(verify)*) | `platform_identity` | RC-01 | ADM | a one-way hash, not encryption, despite the column name |
| | `last_sign_in_at`, `created_at`, `updated_at`, `confirmed_at`, `invited_at`, `banned_until` | PD | E0 | `platform_identity` | RC-01; RC-02 for `banned_until` | ADM | |
| | `confirmation_token`, `recovery_token`, `reauthentication_token`, `email_change_token_*` | C (secret) | E0 (stored as issued by Supabase *(verify whether hashed)*) | `auth_transient` (B-RC37) | RC-01 | cleared by Supabase on use *(verify)*; APJ clears any value older than 24 h; ADM | Selvara issues its own invitation and reset codes (2E), so these should stay empty; the probe alerts on a value older than 24 h |
| | `raw_app_meta_data`, `raw_user_meta_data` | PD | E0 | `platform_identity` | RC-01 | ADM | minimised by B-C29: provider keys written by Supabase only; no display name, tenant, role or custom claim |
| | `is_sso_user`, `is_anonymous`, `aal`-related flags | I | E0 | `platform_identity` | RC-01 | ADM | anonymous sign-in disabled |
| `auth.identities` | `provider`, `provider_id`, `user_id`, `last_sign_in_at`, timestamps | PD | E0 | `platform_identity` (while the account exists) | RC-01 | ADM (cascade) | one row per sign-in method (email, SAML connection) |
| | `identity_data` (email, `sub`, SAML NameID and any mapped attribute) | PD | E0 | `platform_identity` | RC-01 | ADM (cascade) | attribute mapping limited to the email (B-C29); any extra IdP claim is a minimisation defect caught by the probe |
| `auth.sessions` | `user_id`, `created_at`, `updated_at`, `refreshed_at`, `not_after`, `aal`, `factor_id` | PD | E0 | `auth_session` (B-RC36): until expiry or sign-out + 30 days at most | RC-02 | Supabase sign-out on every sign-in finish (2E E-10) removes the session *(verify)*; APJ deletes any row 30 days after `not_after` or creation, whichever is first; ADM (cascade) | Selvara's own session is `control.sessions` (`sign_in_record`) |
| | `ip`, `user_agent` | PD | E0 | `auth_session` | RC-02 | as above | IP in plaintext, unlike `control.sessions.ip_enc` (E1); kept short for that reason |
| `auth.refresh_tokens` | `token`, `session_id`, `user_id`, `revoked`, `parent`, timestamps | C (secret) and PD | E0 | `auth_session` | RC-02 | revoked at sign-out; APJ deletes revoked or expired rows after 30 days at most; ADM (cascade) | |
| `auth.mfa_factors` | `user_id`, `factor_type`, `status`, `friendly_name`, `last_challenged_at`, timestamps | PD | E0 | `account_credential` (B-RC22): until the factor is removed or the identity is deleted | RC-01 | factor removal through the Auth API (C-AC-11); ADM (cascade) | `friendly_name` is set to a fixed non-personal value by Selvara |
| | `secret` (TOTP seed) | C (credential secret) | E0 at the application layer (Supabase-managed *(verify whether Supabase encrypts it)*) | `account_credential` | RC-01 | as above | the most sensitive Auth field; R-B tracks it in G-DR-16 |
| `auth.mfa_challenges` | `factor_id`, `created_at`, `verified_at`, `otp_code` (if present) | PD | E0 | `sign_in_record` (B-RC21): 90 days | RC-02 | APJ; ADM (cascade) | |
| | `ip_address` | PD | E0 | `sign_in_record`: 90 days | RC-02 | APJ | plaintext IP |
| `auth.mfa_amr_claims` | `session_id`, `authentication_method`, timestamps | PD | E0 | `auth_session` | RC-02 | with the session (cascade); APJ | |
| `auth.flow_state` | `user_id`, `auth_code`, `code_challenge`, `provider_type`, `provider_access_token`, `provider_refresh_token`, `authentication_method`, timestamps | C (secret) and PD | E0 | `auth_transient` (B-RC37): 24 h | RC-01 | APJ deletes rows older than 24 h; ADM (cascade) | OIDC is Selvara's own RP (2E E-10a), so provider tokens should never be present; the probe alerts on a non-null provider token |
| `auth.saml_relay_states` | `sso_provider_id`, `request_id`, `for_email`, `redirect_to`, `flow_state_id`, timestamps | PD (`for_email`) | E0 | `auth_transient`: 24 h | RC-01 | APJ | |
| `auth.one_time_tokens` | `user_id`, `token_type`, `token_hash`, `relates_to` (email or phone) | PD; C (hash) | E0; E0 (hash) | `auth_transient`: until used or expired, 24 h at most | RC-01 | APJ; ADM (cascade) | |
| `auth.audit_log_entries` | `payload` (actor id, actor username or email, action, log type, traits) | PD | E0 | `sign_in_record` (B-RC21): **90 days** (shorter if the owner sets it; never longer) | RC-02 | APJ deletes entries older than 90 days; on erasure the job also deletes the subject's entries by actor id and email at once, because the security record Selvara keeps is `control.platform_audit_log` (E1 IP) | Supabase's own audit trail; Selvara's security evidence does not depend on it. Fallback if the table cannot be pruned *(verify)*: disable Auth audit logging if the platform allows it, else record the residual retention in the RoPA and DPA |
| | `ip_address` | PD | E0 | `sign_in_record`: 90 days | RC-02 | APJ | plaintext IP |
| `auth.sso_providers`, `auth.sso_domains`, `auth.saml_providers` | IdP entity id, metadata XML or URL, attribute mapping, domains | C | E0 | `tenant_lifetime` (B-RC16) | RC-01 | removed through the Supabase management API when the SSO connection is removed or the tenant is offboarded (2D D-12a(7), 2G G-OFF-04) | no personal data unless an IdP certificate names a person (rare; C handling) |
| `auth.instances`, `auth.schema_migrations` and other Supabase internals | all | I | E0 | not subject to retention (no PD) | — | — | |

Erasure and offboarding route (G-SAR-06, G-OFF-04, 2D D-12a(7)) (rev P5, one timing in 2B, 2D and 2G; closes §8 item 18 of the Phase 5 evidence): **(a) at the end of the person's last membership** (offboarding, removal) the person's sessions are revoked at once, including any remaining `auth.sessions` and `auth.refresh_tokens` (sign-out through the Auth admin API, 2D D-12a(1)); **(b) at the G-RET-01 point**, which is 30 days after the end of the last membership or after account deletion, whichever is first, the identity worker (D-79) pseudonymises `control.identities` **and in the same run** calls ADM for the Auth user, and APJ (D-80a) removes the subject's `auth.audit_log_entries` and `auth.mfa_challenges` and verifies that no `auth.*` row for the user id remains; **(c) on an upheld erasure**, step (b) runs at once instead of after 30 days. Pseudonymisation and the Auth delete therefore always happen together; neither runs without the other. If the identity gains a new membership within the 30 days, (b) is cancelled. Tests: 2J J-AUTHER-01 to J-AUTHER-10. (Was "when the person's last membership ends … at the same time", which contradicted the 30-day delay of 2D and 2G; and "2J case to add".)

## 4. Coverage check

| ID | Check | Result |
|---|---|---|
| B-C30 | Every table in 2B-data-model §6 (tenant, `control`, `ks`, `ops`, `ref`) appears in §2 or §3 above, or is covered by B-C20/B-C21 alone (`ref_counter`, link tables) | Done by hand for this draft; B-V11 automates it (rev P3). The Supabase `auth` schema of `cp` is now covered (§3.1) and the generated registry includes it (B-C27) (rev P4) |
| B-C31 | Every [PD] field in the Phase 1 inventory maps to an E2 or E1 column, a one-way value (B-C14), or a pseudonymous id (B-C21) | Owner names, emails, viewer lists, NDA signer names, requester emails, contractor names, IdP accounts, external report recipients, IPs, MFA-reset details: mapped (rev P3) |
| B-C32 | No secret is stored in a readable form | API keys (E0 hash), webhook and integration secrets (E0 ref), tokens and codes (E0 hash), recovery codes (E0 hash), key material (only wrapped, only in `ks`) (rev P3) |
| B-C33 | Every retention class used here is defined in 2B §7.1 and is the name 2G G-5 uses | `audit_log`, `evidence`, `risk`, `policy`, `assurance`, `issue`, `access`, `security_telemetry`, `transient`, `operational`, `privacy_case`, `privacy_register`, `external_contact`, `rejected_request`, `financial`, `tenant_lifetime`, `vendor`, `commitment`, `platform_identity`, `ai_governance`, `sign_in_record`, `account_credential`, `platform_lifetime`, `accountability`, `staff_record`, `support`, `ops_short`, `ops_medium` (rev P3); `member_display`, `auth_session`, `auth_transient` (rev P4) |
