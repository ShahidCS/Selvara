# Risk import wizard checklist

Source: `Assurance-GRC-Portal.html` lines 2792-2980 (entry `riskImport()` 2808; Add/Export belong to the Risk module).
React: `src/components/modules/risk/import/{openImportWizard.tsx, ImportWizard.tsx, parse.ts, convert.ts, riskLocal.ts}`, `src/services/riskImport.ts`.

| source feature | source lines | React file | status | notes |
|---|---|---|---|---|
| Open wizard (wide modal, RBAC gate `riskCanEdit`, toast "You do not have permission to import risks") | 2808-2810 | openImportWizard.tsx | done | `openModal(..., {wide:true})`; footer via `LayerFoot` |
| Wizard state IMP (step, fileName, grid, map, autoCount, conflict, parsed, counts, err, reading) | 2793, 2809 | ImportWizard.tsx `useState` | done | transient, dies with the modal (= `impCancel` -> `IMP=null`) |
| Stepper (Upload / Match columns / Check and import, done tick, chevrons) | 2936-2939 | ImportWizard `Stepper` | done | added `aria-current="step"` |
| Step 1 dropzone copy, Browse button, help text, "Try with a sample register" | 2941-2952 | ImportWizard | done | file input is visually hidden but focusable (source used `display:none`), focus ring on the label; copy says "Up to 5,000 rows, 5 MB" (source: 2,000) |
| Reading state (aria-live) and error line (role=alert) | 2949-2950 | ImportWizard | done | messages from `importMessage()` (generic) |
| CSV parser (BOM, quotes, `""`, CRLF) | 2814-2819 | parse.ts `parseCSV` | done | + row/column/cell caps, NUL check |
| ZIP central-directory reader, stored + deflate-raw via `DecompressionStream` | 2820-2837 | parse.ts `unzip`, `inflate` | done | + bounds checks, caps, encrypted/zip64/unsupported rejected |
| XLSX read: shared strings, first sheet by number, inline strings, cell refs to column index | 2838-2854 | parse.ts `readXlsx`, `parseSharedStrings`, `parseSheetXml` | done | source used `DOMParser`; replaced by a bounded tokenizer (see Security notes). Formula cells: cached `<v>` only |
| File chosen: `.xlsx` vs CSV branch, messages | 2855-2860 | ImportWizard `onFile` | done | `no-ds` message and xlsx message kept verbatim; `.xls` handled (see Open questions) |
| Sample CSV (5 rows incl. existing RK-01) | 2861-2867 | ImportWizard `SAMPLE_CSV` | done | verbatim |
| Grid build: drop blank rows, "no data rows" error, header fallback `Column n`, pad rows | 2869-2875 | parse.ts `buildGrid` | done | source silently truncated to 2,000 rows; now rejects > 5,000 with a message |
| Auto-map (exact synonym, then word/phrase match, each column used once) | 2876-2882 | parse.ts `autoMap`, `IMP_FIELDS` | done | synonym lists verbatim |
| Scale conversion (text words, 3/5/10/other scale detection) | 2884-2890 | convert.ts `textScore`, `scaleMax`, `toFive` | done | results clamped 1..5 and NaN-guarded |
| Treatment / status / date normalisation (Excel serials, ISO, free text) | 2891-2896 | convert.ts `treatOf`, `statusOf`, `dateOf` | done | date now positively validated (1900-2200, real calendar date) |
| `impNeutral` apostrophe prefix on `= + - @ tab CR` | 2897 | convert.ts `neutral` | done | applied to every mapped cell as in source |
| Compute preview: Skip "No risk title — row skipped", ID conflict update/new, warnings, residual defaults, category fallback, counts | 2899-2922 | convert.ts `compute` | done | + id format check (new warning, see below) |
| Run import: update path (cl/ci recompute, status keep when Accepted, planned, controls appended to desc, reviewed, history), new path (Draft, imported, history), `wsLog('risk.register.imported')`, toast, close | 2924-2934 | convert.ts `applyImport`, services/riskImport.ts, ImportWizard `run` | done | after success: `bumpData()` + `opts.onDone?.()`; `RISKTAB='reg'; RISKSEL=null` is the Risk module's `onDone` job |
| Step 2: field/column table, `*` on Risk title, sample (40 chars, "(empty)", "—"), "Map a column to Risk title" alert | 2953-2962 | ImportWizard | done | selects have `aria-label` |
| Step 3: 5 stat tiles, conflict radios (recompute on change), preview table (first 150 rows, chips New/Update/Skip, score chips), "Showing the first n of m rows", footnote | 2963-2975 | ImportWizard | done | `th scope="col"`, radiogroup label |
| Footer per step (Cancel / Choose another file + Check rows (disabled until title mapped) / Back to columns + Import n risk(s)) | 2976-2980 | ImportWizard `LayerFoot` | done | |
| Local helpers `rband`, `riskNorm`, `riskLog`, `riskCanEdit` | 2414-2466, 2690 | riskLocal.ts | done | private copies (src/lib/risk.ts did not exist); switch to the shared ones once available |

## Open questions
1. **Update vs "never overwrite existing ids".** The source default ("Update the existing risk" when the Risk ID exists) overwrites an existing risk on purpose; ported as-is, with the "new ID" alternative. New rows can never take an existing id (also re-checked at commit time). Should update-by-ID require the approval workflow (review status is untouched by an update in the source)?
2. **`.xls`.** The source accepted only `.xlsx,.csv` in the picker, and any other extension was parsed as CSV text (binary garbage). The allow-list now includes `xls` as requested but it is rejected with "Old .xls files are not supported. Save the sheet as .xlsx or CSV". Drop `xls` from the list if it should not even be selectable.
3. Source copy "Up to 2,000 rows" and the silent 2,000-row truncation were changed to 5,000 with an explicit rejection message (security brief).
4. Source message "Could not read the file." (FileReader error) is now the generic "Could not read this CSV file.".
5. A status of "Accepted" in a file is turned into Open for new risks and ignored for updates (source). Risk acceptance has its own authority workflow; imports cannot bypass it.
6. Source keeps the spurious extra column that a trailing empty `<c>` creates (e.g. header "Column 4"). Ported as-is.
7. Preview shows imported strings after `neutral()`, so a cell starting with `=` displays with a leading apostrophe and is stored that way (source behavior, intentional formula neutralisation).

## Security notes
Highest-risk input surface (untrusted files). Controls, all client-side; the real API must repeat them (ASVS 12.1, 5.1).

Limits chosen (`parse.ts` `LIMITS`, `convert.ts`):
| limit | value |
|---|---|
| file size (validateUpload) | 5 MB |
| extension allow-list | csv, xlsx, xls (xls rejected after the gate) |
| data rows | 5,000 (excluding header); raw rows scanned incl. blanks 50,000 |
| columns | 100 |
| cell text kept while parsing | 2,000 chars; header text 200 chars |
| zip entries examined | 2,000 |
| decompressed size per XML part / total | 24 MB / 40 MB (enforced on the real inflated bytes, stream aborted on overflow, not on the declared size) |
| every imported string field | `clampText` 500 chars (existing-controls text appended to description capped at 2,000) |
| preview rows rendered | 150 |

* **Zip-bomb / malformed zip:** only `xl/worksheets/sheetN.xml` and `xl/sharedStrings.xml` are inflated; encrypted (flag bit 0), zip64, non-stored/non-deflate entries are rejected; all offsets bounds-checked; signature (`PK\x03\x04`) required, which also rejects password-protected (OLE) workbooks.
* **XML:** no `DOMParser`. A bounded regex tokenizer reads `<row>/<c>/<v>/<is>/<t>/<si>` only, so DTD/entity-expansion attacks are impossible. Only the 5 predefined entities and numeric references (validated range) are decoded. Formulas (`<f>`) are never read or evaluated; only the cached value is used.
* **Errors:** all reading/parsing inside try/catch; user sees fixed messages from `importMessage()`, never exception text or file contents. Names shown via `safeFileName`.
* **Cells are text:** rendered only through React text nodes. No `innerHTML`, `eval`, `dangerouslySetInnerHTML`. CSV/NUL sniff rejects binary files named `.csv`.
* **Formulas:** a cell beginning with `= + - @ tab CR` gets a leading apostrophe on import (source `impNeutral`); any later export goes through `csvCell` (Risk module export uses its own `riskCsvCell`; same guard).
* **Numbers:** likelihood/impact (inherent, residual) are converted to integers and clamped 1..5, NaN guarded; dates must be real calendar dates 1900-2200 else dropped; statuses/treatments/categories are mapped onto fixed allow-lists.
* **IDs:** imported ids must match `^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$` (else a new id is generated, with a warning); new rows never reuse an existing id (checked at preview and again at commit); generated ids avoid collisions.
* **Authorization:** `riskCanEdit()` checked on open and again on import (UI-only, as in the source: the API must enforce it). Audit: `risk.register.imported` (counts and clamped file name) and a per-risk history entry, as in the source.
* **No network/storage:** file content never leaves the browser and is not stored in localStorage; the `commitRiskImport` stub in `src/services/riskImport.ts` only forwards already-validated rows in http mode.
* **Not covered (needs backend):** malware scanning, server-side size/row limits, server-side re-validation, rate limiting, who may update which risk.

Tests (throwaway, not in repo): CSV with BOM/quotes/embedded newline, hand-made xlsx (shared strings with rich runs and entities, inline strings, sparse columns, empty rows, formula cell), 30 MB zip-bomb part (rejected, `limit-size`), column 100+ (rejected), garbage zip (generic error).
