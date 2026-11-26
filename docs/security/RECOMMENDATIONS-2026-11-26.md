# Recommendations, 2026-11-26: malware scanning and email aliases

Follow-up to the security audit (`AUDIT-2026-11-26.md`), on the owner's request. Drafts for review; nothing here is built yet.

## 1. Malware scanning of uploads (SEC-18)

Requirement from the owner: open-source, no usage limits. Uploads today: evidence, knowledge-base documents, Trust Center documents and
vendor-portal files; at most 4 MB; types pdf, png, jpg/jpeg, docx, xlsx and text (txt, csv, md, json), checked by content.

### Options

| Option | Licence | What it catches | Limits | Fit |
|---|---|---|---|---|
| **ClamAV** (Cisco Talos) as a daemon (`clamd`) | GPL-2.0 (the engine runs as a separate service, so Selvara's code is not affected) | Known malware by signature (updated several times a day by `freshclam`), malicious PDFs and Office files, archives, phishing patterns | None: no quotas, no per-scan fees; you pay only for the host | **Recommended core.** The industry-standard open-source scanner |
| ClamAV REST wrapper, e.g. `ajilach/clamav-rest` or `benzino77/clamav-rest-api` | MIT | Same as ClamAV, over HTTPS | None | Recommended way to call `clamd` from Selvara's serverless API |
| **oletools** (`mraptor`, `olevba`) and **pdfid** | BSD-2 / public domain | Macros and auto-exec code in Office files, risky PDF features (JavaScript, auto-actions, embedded files) | None | Recommended second layer in the same container: rejects active content even when no signature matches |
| **YARA** with community rules (for example YARA-Forge) | BSD-3 | Pattern rules for families and techniques | None | Optional third layer; needs someone to curate rules |
| Dangerzone (content disarm and reconstruction) | AGPL-3.0 | Converts documents to safe PDFs | None, but heavy (containers per file) | Not recommended now: too heavy for 4 MB GRC evidence |
| VirusTotal or other cloud multi-scanners | proprietary | Broad | Quotas, and files are shared with third parties | **Not suitable**: customer evidence must not leave your control |

### Recommended design

1. **Host:** one small container (2 vCPU, 2 GB RAM: ClamAV keeps its signatures in memory) on a host you control (any container platform or a
   VM). Vercel functions cannot run a scanning daemon. Restrict it to HTTPS with a long random token, accepting calls only from Selvara.
2. **Flow:** the upload is checked as today (type, size, content), stored under a **quarantine** path, and the record shows "Scanning".
   The server sends the bytes to the scanner (ClamAV, then oletools/pdfid). Clean: the file moves to its normal path and becomes
   downloadable. Infected or active content: the object is deleted, the record shows "Refused: <reason>", and the event is audited and
   logged as a security event. **Fail closed:** if the scanner does not answer, the file stays in quarantine (not downloadable) and admins
   see "Waiting for the scanner"; a retry job finishes it later.
3. **Signatures:** `freshclam` every hour; an alert if signatures are older than 24 hours (the scanner reports its database date).
4. **Already stored files:** a one-time rescan job after go-live, then a weekly rescan of files shared outside the company (Trust Center,
   auditor packages).
5. **Configuration:** `SCANNER_URL` and `SCANNER_TOKEN` (SECRET) in the server environment; without them uploads keep today's behaviour and
   the admin console shows "Malware scanning is not set up".

What I need from you: where to host the scanner container. Then I build the app side (quarantine, statuses, retry, tests with the EICAR test
file) in one change.

## 2. Email aliases of rejected applicants (EDGE-20)

### Recommendations

1. **Never rewrite stored addresses.** Store what the person typed (trimmed, lower case). Aliases are often legitimate (one person, several
   mailboxes) and rewriting breaks delivery.
2. **Compare with a match key, not the address.** For checks only, compute: lower case, Unicode NFKC, domain in punycode (IDNA), the `+tag`
   removed from the local part, and for `gmail.com` / `googlemail.com` the dots removed and the domain unified. Store only an **HMAC** of the
   key (keyed with `SERVER_SECRET`), never the key itself.
3. **Flag, do not block.** When a new request's key matches a request this company rejected (or a member it removed) in the last 12 months
   (3 months for an ordinary rejection, per the retention policy), the admin sees "Matches a request rejected on <date>: <reason>" and must
   give a reason to approve. False matches are possible (shared or recycled addresses), so a person never gets an automatic refusal.
4. **Let companies restrict domains.** A company setting "people may ask to join only from these email domains" (for example
   `acme.example`), with invitations for anyone else. For most business customers this removes the alias question entirely. Recommend it
   on by default when the company's admins share one corporate domain.
5. **Refuse disposable addresses** on requests to join, using the open community list `disposable-email-domains` (CC0), refreshed monthly.
6. **No device fingerprinting.** It is personal data under GDPR and ePrivacy and adds little in a B2B product with admin approval. Keep the
   address-based rate limits and IP blocking already in place.
7. **Platform-wide abuse list** (rare): platform staff may add a match-key HMAC with a reason, four-eyes, kept 12 months, for abuse across
   companies (spam requests). It only flags, like item 3.

### Order of work, if approved

Domain restriction (4) and disposable-address refusal (5) first: small, high value. Then the match key and the admin flag (2, 3), then the
platform list (7).
