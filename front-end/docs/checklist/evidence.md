# Evidence module checklist

Source: `Assurance-GRC-Portal.html` lines 2217-2251. React: `src/components/modules/EvidenceModule.tsx`, `evidence/{EvidencePreview,EvidenceForms}.tsx`, `src/services/evidence.ts`.
No seed data extraction was needed (`DATA.evidence` already exists).

| source feature | source lines | React file/component | status | notes |
|---|---|---|---|---|
| evInit defaults (ver, attachments from name+type ext, history) | 2218 | `services/evidence.evInit`, called on render | done | random attachment size is demo-only |
| Selected id state EVSEL | 2219 | `useModState("evidence.sel")` | done | persists across navigation; ignored when the record no longer exists |
| Split layout: list card + preview card, count tag | 2221 | `EvidenceModule` | done | |
| "Add evidence" page action | 2222 | `EvidenceModule` | done | |
| List rows (name, `type, vN, updated`), selected highlight | 2224 | `EvidenceModule` | done | rows keyboard-operable (`activate`) |
| Empty preview "Select evidence" | 2221 | `EmptyPreview` | done | |
| Preview: header, Active chip, Edit, Delete | 2227 | `EvidencePreview` | done | |
| Preview: meta grid, notes | 2228-2229 | `EvidencePreview` | done | |
| Attachments table + "No files attached." + Remove | 2230-2231 | `EvidencePreview` | done | icon button has aria-label |
| Version history (newest first) | 2232-2233 | `EvidencePreview` | done | |
| Add/edit form (name*, type, collected by, notes) | 2235-2238 | `EvidenceForm` | done | default collected-by "J. Avery" (anonymised from J. Avery) |
| Create: id `EV-(209+n)`, unshift, history "Evidence created", log `evidence.created`, toast "Evidence added", select new | 2239-2242 | `EvidenceForm`, `svc.createEvidence` | done | |
| Validation "Name is required." | 2240, 2244 | `EvidenceForm` | done | |
| Edit: log `evidence.updated`, toast "Changes saved" | 2243-2244 | `EvidenceForm`, `svc.updateEvidence` | done | |
| Delete confirm modal + log `evidence.deleted`, toast "Evidence deleted", clears selection | 2245-2246 | `DeleteEvidence` | done | |
| Attach file modal, help text, "File name is required.", log `evidence.attachment.added`, toast "File attached" | 2247-2248 | `AttachFile` | done | see Security notes (extension check added) |
| Remove attachment: log `evidence.attachment.removed`, toast "File removed" | 2249 | `EvidencePreview.detach` | done | |
| New version modal, "A note is required.", log `evidence.version.created`, toast `Version vN created` | 2250-2251 | `NewVersion`, `svc.createVersion` | done | |

## Open questions
1. Edit does not default "Collected by" when blank (create uses "Unassigned"); an edit can store an empty string. Ported as-is.
2. The source id scheme `EV-(209+count)` can collide after a delete followed by an add. Ported, but the service bumps the number until the id is unique (no change otherwise).
3. "Attach file" only records a typed name with a random size; no real file is chosen or read. Kept (copy says "No file is uploaded"). Should the real product use a file picker?
4. Delete asks for confirmation but has no role gate; same for add/edit/version. Source had none.
5. The preview always shows an "Active" chip regardless of record state (source hard-codes it).

## Security notes
Enforced by the UI (all of it also needs server enforcement):
* All names, notes, file names and history text render as React text; no `dangerouslySetInnerHTML`/innerHTML (source used `esc()` into innerHTML strings, ids were also interpolated into inline `onclick="..."` handlers, which is removed entirely).
* Free text capped with `clampText` (name 160, collected by 80, notes 2000, version note 300) plus `maxLength`; type checked against the allow-list `EVIDENCE_TYPES`.
* Attachment names pass `safeFileName` (strips path separators/control chars, caps length) on input and display. If the name has an extension it must pass the `validateUpload` allow-list (pdf, png, jpg, jpeg, txt, csv, docx, xlsx, json, md); this blocks e.g. `.html`/`.svg`/`.exe` names. Names with no extension are accepted as in the prototype. This adds one possible error message not in the source (the `validateUpload` text).
* No upload happens, so no file contents are read or rendered. When real uploads arrive: the API must re-validate extension, MIME and magic bytes, size, scan for malware, store outside the web root, and serve with `Content-Disposition: attachment` and `nosniff`.
* Every `wsLog` call from the source is kept (`evidence.created|updated|deleted|attachment.added|attachment.removed|version.created`); actor comes from `getMe()`. Log text is rendered as React text.
* Ids from the module state are looked up in `DATA`; a missing record renders the empty preview / "Evidence not found." rather than throwing.
* Service errors show a generic toast, never exception text.

Must be enforced by the real API (UI only in the prototype):
* Authorization for create, edit, delete, attach, detach and new version (source has no role gate for any of them). Deletion of evidence is destructive and affects audit support; it needs RBAC, soft delete and an immutable audit trail.
* Authoritative version numbers, timestamps and "collected by" (client supplies actor and dates in the demo; server must derive them from the session).
* Server-side length/enum validation, id generation (the `EV-nnn` scheme is demo-only; `Math.random` sizes are not meaningful).
* Version history immutability; history is editable in memory here.
