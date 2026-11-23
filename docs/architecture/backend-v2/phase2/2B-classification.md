# Phase 2B: Data classification, field-level encryption and retention

| | |
|---|---|
| Workstream | B (Data model) |
| Status | Proposed, Phase 2 design. **DRAFT** pending legal and compliance review. |
| Companion of | [2B-data-model.md](2B-data-model.md) (table ids B-E.., retention classes B-RC.., encryption decision B-D18) |
| Related | ADR-003 (keys, workstream F/G), ADR-008, ADR-011 |

## 1. Scheme

### 1.1 Classes

| ID | Class | Code | Definition | Minimum handling |
|---|---|---|---|---|
| B-C01 | Public | P | Published on purpose by the tenant (after an explicit publish action) or by Selvara | Integrity only |
| B-C02 | Internal | I | Operational data of no harm if disclosed inside the tenant: ids, states, timestamps, settings | Tenant isolation |
| B-C03 | Confidential | C | Tenant business content: control design, risks, findings, contracts, vendor assessments, security posture | Isolation, access by permission, auditor scope by engagement |
| B-C04 | Personal data | PD | Information about an identified or identifiable person, including pseudonymous user ids, emails, IP addresses | C handling plus minimisation, erasure path, DSR locate |
| B-C05 | Special category | SC | GDPR Art. 9 / Art. 10 type data *(verify per jurisdiction)*, or a field designed to describe it about a person | PD handling plus field-level encryption, access logged |

Precedence: SC > PD > C > I > P. "C (may hold PD)" marks free text that is classed by its purpose but can carry personal data by accident (R-28).

### 1.2 Encryption codes

| ID | Code | Meaning |
|---|---|---|
| B-C10 | No | Storage-level encryption at rest only (provider-managed) |
| B-C11 | T | Field-level envelope encryption with the tenant DEK (ADR-003). Crypto-shredded with the tenant. |
| B-C12 | S | Field-level encryption with a per-subject key (one per member, workforce person or external party). Crypto-shredded per person, which reaches backups (discovery §6 condition 1). |
| B-C13 | F | File bytes encrypted with a per-file key wrapped by the tenant DEK (`file_object.wrapped_file_key`) |
| B-C14 | H | One-way: SHA-256 for random tokens, HMAC (keyed) for low-entropy values (emails in `_bidx`, IPs in `_hmac`, API keys) |
| B-C15 | R | Secret reference only: the value lives in the secret store, never in the database |
| B-C16 | CP | Control-plane field encrypted with a platform key (A-29) |

### 1.3 Rules that apply to every table

| ID | Rule |
|---|---|
| B-C20 | Standard columns `id`, `tenant_id`, `ref`, `created_at`, `updated_at`, `version`, `deleted_at`, `legal_hold`, `retention_class`, every state and enum column, every date that is not about a person's life: **I, No**. Not repeated below. |
| B-C21 | `created_by`, `updated_by` and every `*_user_id`, `*_by`, `*_person_id`, `user_ids[]` column: **PD (pseudonymous), No**. The name behind the id is in `member_profile` or `person` (S). Not repeated below. |
| B-C22 | Every `_enc` column is listed with its key scope. Every `_bidx` and `_hmac` is **PD, H**. |
| B-C23 | `record_history.before/after` inherits the classification of the row; encrypted fields stay ciphertext in it (B-H07). |
| B-C24 | The retention class (RC) is the row's default from 2B-data-model unless the field row says otherwise (column-level purge, B-RC30 to B-RC34). |
| B-C25 | Free text that accepts user input is never S-encrypted (search and reporting need it); the input form runs the PII detector (`lib/pii.ts` today) and warns. Privacy, incident and approval-payload free text is T. |
| B-C26 | Nothing classed PD or SC may appear in: `ops` messages, `audit_log_entry.detail`, `notification.title/body`, application logs, error messages, webhook payloads, AI prompts with masking on (workstream F/G check every store, discovery §6 condition 3). |
| B-C27 | The registry of this file is machine-readable in the repository (one entry per column: class, encryption, retention class); CI fails on a column with no entry (B-V11). |

## 2. Tenant schema, per entity

Column: **Field** → **Class** · **Enc** · **RC** (blank = row default) · note. Anchor = the event the row's retention runs from.

### M01 Settings

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `tenant_settings` (offboarding) | lockout, password, upload, SLA, review-cycle settings | C | No | | security configuration of the tenant |
| | `brand_preset`, `data_region` | I | No | | |
| `trusted_network` (offboarding) | `cidr` | C | No | | office network ranges; not personal unless a single home address (warning in UI) |
| | `label` | C (may hold PD) | No | | |
| `tenant_role`, `tenant_role_permission` (offboarding) | `name`, `description`, `permission_code`, `scope` | I | No | | |
| `member_profile` (membership end) | `display_name_enc` | PD | S | `platform_identity` | |
| | `email_enc` | PD | S | `platform_identity` | |
| | `email_bidx` | PD | H | | |
| | `job_title`, `department` | PD | No | | low sensitivity, used for filters |
| | `tour_prefs` | I | No | | |
| `ref_counter` | all | I | No | | |

### M02 Frameworks

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `framework_scope` (retirement) | `in_scope`, dates | C | No | | which certifications a tenant pursues is commercially confidential |
| `custom_framework`, `custom_requirement` (retirement) | `name`, `title`, `guidance` | C | No | | may hold licensed text the tenant pasted (R-24) |
| `requirement_status` (retirement) | `applicability`, `implementation` | C | No | | |
| | `na_reason` | C (may hold PD) | No | | |
| `control_mapping` | all | C | No | | |
| `content_pin`, `content_upgrade` | all; `diff` | I | No | | ids and counts only |

### M03 Controls

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `control` (retirement) | `title`, `description`, `domain`, `status` | C | No | | |
| | `external_ticket_key` | I | No | | |
| `control_test` (retirement) | `name`, `logic`, `cadence` | C | No | | test logic reveals the security posture |
| `test_run` (run time) | `result`, counts | C | No | | |
| | `items_enc` | PD | T | column purge 13 months (B-RC30) | names employee accounts from integrations |
| | `note` | C (may hold PD) | No | | |
| `control_exception` (closure) | `reason`, `compensating` | C (may hold PD) | No | | |
| `control_attestation` | `statement` | C | No | | |
| `control_test_link`, `control_link` | all | C | No | | |

### M04 Evidence

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `evidence` (superseded or deleted) | `name`, `description` | C (may hold PD) | No | | |
| | `type`, `valid_from`, `expires_on`, `review_state` | I | No | | |
| | `delete_reason` | C (may hold PD) | No | | |
| `evidence_version` | `note` | C (may hold PD) | No | | |
| | `manifest_sha256` | I | No | | |
| | files (via `file_object`) | C, may hold PD or SC | F | | screenshots, exports and records can hold employee or customer data (AS gap 7) |
| `evidence_link` | all | C | No | | |
| `evidence_review` | `note` | C (may hold PD) | No | | |

### M05 Policies

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `policy` (last version superseded) | `name`, `category`, review dates | I | No | | |
| `policy_version` (superseded) | `body` | C | No | | P when the tenant publishes the policy on the Trust Center (copy in `trust_document`) |
| | `change_note` | C (may hold PD) | No | | |
| | `body_sha256` | I | No | | |
| `policy_approval` | `reason` | C (may hold PD) | No | | |
| `policy_attestation` | `attested_at`, `channel` | PD | No | | an individual's acknowledgement |
| `policy_exception` | `reason`, `scope` | C (may hold PD) | No | | |

### M06 Risk

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `risk_method_settings`, `risk_criteria` | all | C | No | | appetite and thresholds are confidential governance data |
| `asset` (retirement) | `name`, `location`, CIA ratings, `business_value` | C | No | | |
| | `holds_personal_data`, `holds_special_category` | C | No | | flags, not personal data |
| `threat`, `vulnerability` (retirement) | `name`, `description`, `cve_id`, `severity` | C | No | | unremediated vulnerabilities are highly confidential; access limited by permission |
| `risk` (closure) | `title`, `description` | C (may hold PD) | No | | |
| | scores, `category`, `register`, `jurisdiction` | C | No | | |
| `risk_asset`, `risk_threat`, `risk_vulnerability`, `interested_party_risk` | all | C | No | | link rows |
| `risk_treatment`, `treatment_action` | `plan`, `text`, `cancel_reason`, cost | C | No | | |
| `risk_acceptance` | `rationale`, `compensating` | C | No | | |
| | `board_ref`, `board_date`, `board_body` | C | No | | Board minutes as evidence files (F) |
| `risk_review` | `note` | C | No | | |
| `interested_party` | `party`, `requirement`, `location` | C | No | | organisations or roles (A-32); PD if a person is named |
| `risk_snapshot` | `content` | C | No | | holds ids, not names |
| `risk_import` | `rows` | C, holds PD (owner names in the file) | No | column purge 30 days (B-RC33) | the uploaded file is F |

### M07 Issues

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `issue` (closure) | `title`, `description`, `root_cause`, `corrective_action`, `verification_note` | C (may hold PD) | No | | |
| `issue_task` | `text` | C (may hold PD) | No | | |
| `issue_link` | all | C | No | | |

### M08 Audits

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `audit` (complete) | `name`, `scope`, dates, `close_reason` | C | No | | |
| | `auditor_firm` | C | No | | organisation, not a person |
| `audit_shared_item` | all | C | No | | defines what the auditor may read |
| `auditor_access` | window, `ended_by_kind` | PD | No | | an individual's access record |
| `pbc_request`, `information_request` | `item`, `response` | C (may hold PD) | No | | |
| `finding` | `title`, `recommendation`, `rejected_reason` | C | No | | |
| `audit_test` | `note`, `result`, `sample_size` | C | No | | |

### M09 Vendors

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `vendor` (offboarded) | `name`, `category`, `service_description`, `processing_countries` | C | No | | P for the sub-processor list once `is_subprocessor` and gate `approved` |
| | `tier`, `score`, `gate`, `gate_reason` | C | No | | |
| | logo (`file_object`) | P | F | | |
| `vendor_contact` (relationship end) | `name_enc`, `email_enc`, `phone_enc` | PD | S | `external_contact` | third-party people |
| | `role_title` | PD | No | | |
| `vendor_certificate` | type, issuer, dates, `waiver_reason` | C | No | | |
| `vendor_assessment` | `score`, `outcome`, `assessor_org` | C | No | | |
| `vendor_finding` | `title`, `close_reason` | C | No | | |
| `vendor_request` | `vendor_name`, `reason` | C | No | | |
| `vendor_portal_invite` (terminal state) | `token_hash` | I | H | `transient` | |

### M10 Questionnaires

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `questionnaire_template`, `template_question` | all | C | No | | |
| `questionnaire` | `customer_org`, `clarify_note` | C | No | | |
| `question_response` | `answer`, `answer_text`, `comment` | C (may hold PD) | No | | vendor's answers about its own security |
| | attachment (`file_object`) | C | F | | |
| `answer_library` | `question`, `answer` | C | No | | P when `published_to_trust` |
| `kb_document` | `title`; file | C | No; F | | |

### M11 Trust Center

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `trust_settings` | `public_ref`, `public_page_on` | P | No | | |
| | `blocked_domains` | C | No | | |
| `trust_section` | `title`, `body` | P when published and `visibility = public`; C otherwise | No | | |
| `trust_document` | `name`, `description` | P (public) or C (on request, NDA) | No | | NDA document names are C (F1-02) |
| | file | as `access` | F | | |
| `trust_account` (last activity) | `company_name`, `domain` | C | No | `external_contact` | organisation |
| `trust_viewer` (last activity) | `email_enc` | PD | S | `external_contact` | |
| `trust_nda_acceptance` | `accepted_at`, `ip_hmac` | PD | No; H | `external_contact` | |
| `trust_grant`, `trust_access_request` | `reason`, `note` | C (may hold PD) | No | | |
| `trust_subscription` | `unsubscribe_token_hash` | I | H | | |
| `trust_chat` (asked) | `question_enc` | C (may hold PD) | T | `operational` | anonymous free text |
| | `visitor_domain` | PD | No | | |
| `trust_update` | `title`, `body` | P | No | | |
| `visitor_session` (ended) | `email_enc` | PD | S | column purge at end (B-RC34) | |
| | `code_hash` | I | H | | |
| | `ip_hmac` | PD | H | | |

### M12 People and access

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `person` (left) | `display_name_enc`, `email_enc` | PD | S | | |
| | `job_title`, `department`, `manager_person_id`, `start_on`, `end_on`, `employment_status` | PD | No | | employment data; HR-adjacent, minimised (no salary, no reasons for leaving) |
| `contractor` | `company_name`, `contract_end_on` | PD | No | | |
| `system` | `name`, `description`, `is_privileged`, `data_classification` | C | No | | |
| `access_grant` | `level`, dates, `revoke_reason` | PD | No | | who can access what |
| `access_request` | `reason`, `decision_reason` | PD (may hold more) | No | | |
| `access_review`, `access_review_item` | decisions | PD | No | | |

### M13 AI governance

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `ai_system` (archived) | `name`, `purpose`, `model`, `provider_name`, tiers, EU class | C | No | | |
| | `data_reached` | C (may describe SC processing) | No | | describes categories, not people |
| `ai_assessment` | `summary_enc` | C (may describe SC) | T | | FRIA and DPIA screening content |
| | `answers` | C | No | | |
| `ai_signal` | `text_enc` | PD, may hold SC | T | | quotes context blocked by the PII filter |
| | `recommendation` | C | No | | |

### M14 Privacy

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `processing_activity` (retired) | all descriptive fields | C | No | | the tenant's register, may be shown to regulators |
| `processing_link` | all | C | No | | |
| `dpia` (superseded) | `screening_rationale_enc`, `description_enc`, `necessity_enc`, `risks_enc`, `measures_enc`, `dpo_advice_enc` | C (may describe SC) | T | | |
| | `residual_risk`, `prior_consultation_required`, `consultation_ref` | C | No | | |
| `data_subject_request` (closed) | `subject_name_enc`, `subject_email_enc`, `subject_identifiers_enc`, `agent_details_enc` | PD | S | | the data subject's own key |
| | `subject_email_bidx` | PD | H | | |
| | `request_type`, dates, `status`, `outcome` | PD | No | | the existence of a request is personal data |
| | `refusal_reason_enc` | PD | T | | |
| | `special_category_involved` | SC (flag) | No | | the flag reveals that SC exists, not what it is |
| | response package (`file_object`) | PD, may hold SC | F | | |
| `dsr_task` | `result_note_enc` | PD | T | | |
| | `located_count` | PD | No | | |
| `retention_rule`, `legal_hold` | `basis`, `matter`, `reason` | C | No | | a legal matter can be highly sensitive; permission-limited |

### M15 Commitments

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `contract` (expiry) | `counterparty_org`, `title`; file | C | No; F | | |
| `commitment` | `name`, `detail`, `review_note` | C | No | | |
| `incident` (closed) | `summary_enc`, `outcome_enc` | PD, may hold SC | T | | breach descriptions |
| | breach flags, notification times | C | No | | |

### M16 to M18

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `report_schedule` | `external_recipients_enc` | PD | T | | external business addresses |
| | `recipient_user_ids` | PD | No | | |
| `report_run` | output file | C (may hold PD) | F | | |
| `integration` | `config` | C | No | | identifiers of cloud accounts and tenants |
| | `config_contact_enc` | PD | T | | IdP admin email |
| | `credential_secret_ref` | C | R | | |
| | `last_error` | C | No | | providers' error text, sanitised of tokens |
| `integration_sync_run` | counts, `error` | I | No | | |
| `integration_account` (disconnect) | `display_name_enc`, `email_enc` | PD | S | | employee data from identity providers (F1-08) |
| | `mfa_enabled`, `is_admin`, `last_login_at`, `status` | PD | No | | |
| `api_key` | `prefix` | I | No | | |
| | `key_hmac` | C | H | | |
| `webhook` | `url` | C | No | | |
| | `signing_secret_ref` | C | R | | |
| `webhook_delivery` | all | I | No | | payload not stored |

### M19 to M26

| Entity (anchor) | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `ai_tenant_settings` | all | C | No | | `provider_config_id` points to a control-plane row holding only secret references |
| `agent` | all | C | No | | |
| `agent_run` | `draft_enc` | C (may hold PD) | T | column purge 13 months (B-RC31) | |
| | `change_summary`, `decided_reason` | C (may hold PD) | No | | |
| | tokens, model | I | No | | |
| `agent_change` | `proposed` | as the target table | T if the target field is T or S | | never plaintext of an encrypted target field |
| `notification` | `title`, `body` | I | No | | B-C26: no PD of other people |
| `notification_pref` | all | PD | No | | preferences of one person |
| `approval` | `title` | C | No | | |
| | `payload` | C | No | | |
| | `payload_enc` | PD | T | | sensitive kinds (MFA reset identity checks, offboarding) |
| `approval_vote` | `reason` | C (may hold PD) | No | | |
| `delegation` | `reason` | C (may hold PD) | No | | |
| `audit_log_entry` | `action`, `category`, `target_*`, `detail`, hashes | I | No | | |
| | `actor_id` | PD | No | | |
| | `ip_enc` | PD | T | column purge 1 year (B-RC32) | |
| | `pd_enc` | PD | S | column purge 1 year (B-RC32) | rare: values a regulator requires in the log |
| `audit_anchor` | all | I | No | | |
| `record_history` | `before`, `after` | as the source row | as the source row | as the source row | |
| `file_object` | `original_name_enc` | C (may hold PD) | T | | |
| | `path`, `sha256`, `size_bytes`, `mime_type`, `scan_state` | I | No | | paths carry `tkey` and ids only |
| | bytes | as the owner | F | | |
| `automation_rule`, `automation_run` | all | I | No | | |

## 3. Control plane and other schemas

| Entity | Field | Class | Enc | RC | Note |
|---|---|---|---|---|---|
| `control.tenants` | `name`, `customer_ref`, `region`, `status` | C | No | `financial` after closure | `tkey` is I and random (S1) |
| `control.identities` | `email_enc`, `display_name_enc` | PD | CP | `platform_identity` | |
| | `email_bidx` | PD | H | | |
| `control.memberships` | all | PD | No | `platform_identity` | |
| `control.invitations` | `email_enc` | PD | CP | `transient` | |
| | `token_hash` | I | H | | |
| `control.sessions`, `control.auth_throttle` | `ip_enc`, device | PD | CP | `security_telemetry` | |
| `control.recovery_codes`, `control.passkeys` | hashes, public keys | C | H / No | account lifetime | |
| `control.subscriptions` | `contact_enc`, `address_enc` | PD | CP | `financial` | billing contact (F1-07: no card data ever) |
| `control.invoices`, `invoice_lines`, `ledger_entries`, `credit_notes`, `payments` (2I) | amounts, tax, provider refs | C | No | `financial` | |
| `control.usage_meters` | counts | I | No | `financial` | aggregated, no content |
| `control.provider_configs`, `control.key_registry` | references, key ids and versions | C | R | platform lifetime | never key material |
| `control.platform_audit_log` | like `audit_log_entry` | as there | as there | `audit_log` | |
| `control.support_questions`, `support_messages` | `subject`, `body` | C (may hold PD) | CP | `privacy_case` *(verify)* | Selvara is controller |
| `control.ropa_selvara` | all | C | No | platform lifetime | |
| `control.sso_connections` | IdP metadata, certificates | C | No | tenant lifetime | |
| `control.scim_tokens` | token hash | C | H | tenant lifetime | |
| `control.deletion_certificates` | all | C | No | 10 years *(verify)* | evidence of erasure; holds no deleted content |
| `ref.*` | all | P or I | No | permanent | no personal data (B-RF12) |
| `ops.*` | job ids, `tkey`, counters | I | No | `operational` | no PD, no free text (B-P04) |

## 4. Coverage check

| ID | Check | Result |
|---|---|---|
| B-C30 | Every table in 2B-data-model §6 appears in §2 or §3 above, or is covered by B-C20/B-C21 alone (`ref_counter`, link tables) | Done by hand for this draft; B-V11 automates it |
| B-C31 | Every [PD] field in the Phase 1 inventory maps to an S, T, H or CP column, or to a pseudonymous id (B-C21) | Owner names, emails, viewer lists, requester emails, contractor names, IdP accounts, IPs, MFA-reset details: mapped |
| B-C32 | No secret is stored in a readable form | API keys (H), webhook and integration secrets (R), tokens and codes (H), recovery codes (H), key material (never in the database) |
