/* Risk import: file reading (CSV + hand-written XLSX/ZIP reader), grid building and column auto-map.
 * Source: Assurance-GRC-Portal.html impParseCSV / impUnzip / impReadXlsx / impSetGrid / impAutoMap (lines 2814-2882).
 * Untrusted input: every cell is text; hard limits below stop DoS (zip bombs, huge sheets). No DOM, no eval, no HTML. */

export const LIMITS = {
  maxFileBytes: 5 * 1024 * 1024, // upload gate
  maxRows: 5000, // data rows (excluding the header row)
  maxScanRows: 50000, // raw rows scanned (blank rows included) before giving up
  maxCols: 100,
  maxCellChars: 2000, // stored per cell while parsing (fields are clamped again to 500 on import)
  maxZipEntries: 2000, // central directory entries examined
  maxEntryBytes: 24 * 1024 * 1024, // decompressed size of one XML part
  maxTotalBytes: 40 * 1024 * 1024, // decompressed size of all parts read
  maxHeaderLen: 200,
};

export type ImportErrCode = "no-ds" | "bad-xlsx" | "bad-csv" | "limit-rows" | "limit-cols" | "limit-size" | "legacy-xls" | "no-data";
export class ImportError extends Error {
  constructor(public code: ImportErrCode) { super(code); }
}
/** Generic, user-safe messages (never raw exception text). Copy of the source messages where the source had one. */
export function importMessage(e: unknown): string {
  const code = e instanceof ImportError ? e.code : "bad-xlsx";
  switch (code) {
    case "no-ds": return "This browser cannot read .xlsx here. Export the sheet as CSV and import that.";
    case "bad-csv": return "Could not read this CSV file.";
    case "limit-rows": return `The file has more than ${LIMITS.maxRows.toLocaleString("en-US")} data rows. Split it into smaller files and import them one by one.`;
    case "limit-cols": return `The file has more than ${LIMITS.maxCols} columns. Remove the unused columns and try again.`;
    case "limit-size": return "This workbook is too large to read safely here. Export the sheet as CSV and import that.";
    case "legacy-xls": return "Old .xls files are not supported. Save the sheet as .xlsx or CSV and import that.";
    case "no-data": return "The file has no data rows under a header row.";
    default: return "Could not read this .xlsx file. Check it is a valid Excel workbook, or export it as CSV.";
  }
}

const clampCell = (s: string) => (s.length > LIMITS.maxCellChars ? s.slice(0, LIMITS.maxCellChars) : s);

/* ---------------------------------- CSV ---------------------------------- */
export function parseCSV(input: string): string[][] {
  const text = String(input || "").replace(/^﻿/, "");
  if (text.slice(0, 4096).indexOf("\u0000") >= 0) throw new ImportError("bad-csv"); // binary file renamed .csv
  const rows: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  const pushCell = () => {
    if (row.length >= LIMITS.maxCols) throw new ImportError("limit-cols");
    row.push(cur.length > LIMITS.maxCellChars ? cur.slice(0, LIMITS.maxCellChars) : cur);
    cur = "";
  };
  const pushRow = () => {
    rows.push(row); row = [];
    if (rows.length > LIMITS.maxScanRows) throw new ImportError("limit-rows");
  };
  for (let k = 0; k < text.length; k++) {
    const ch = text[k];
    if (q) {
      if (ch === '"') { if (text[k + 1] === '"') { cur += '"'; k++; } else q = false; }
      else cur += ch;
    } else {
      if (ch === '"') q = true;
      else if (ch === ",") pushCell();
      else if (ch === "\n") { pushCell(); pushRow(); }
      else if (ch === "\r") { /* ignored, as in the source */ }
      else cur += ch;
    }
    // a single unterminated quoted cell must not grow without bound
    if (cur.length > LIMITS.maxCellChars * 4) cur = cur.slice(0, LIMITS.maxCellChars);
  }
  if (cur !== "" || row.length) { pushCell(); pushRow(); }
  return rows;
}

/* ---------------------------------- ZIP ---------------------------------- */
const u16 = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8);
const u32 = (d: Uint8Array, o: number) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;

/** Raw DEFLATE through the browser's native stream, aborting as soon as `cap` decompressed bytes are exceeded (zip-bomb guard). */
async function inflate(bytes: Uint8Array, cap: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new ImportError("no-ds");
  const ds = new DecompressionStream("deflate-raw");
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(ds).getReader();
  const chunks: Uint8Array[] = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) { try { await reader.cancel(); } catch { /* ignore */ } throw new ImportError("limit-size"); }
    chunks.push(value);
  }
  const out = new Uint8Array(total); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export async function unzip(buf: ArrayBuffer, want: (name: string) => boolean): Promise<Record<string, Uint8Array>> {
  const d = new Uint8Array(buf);
  if (d.length < 22 || u32(d, 0) !== 0x04034b50) throw new ImportError("bad-xlsx");
  let eo = -1;
  for (let k = d.length - 22; k >= 0 && k >= d.length - 22 - 65536; k--) { if (u32(d, k) === 0x06054b50) { eo = k; break; } }
  if (eo < 0) throw new ImportError("bad-xlsx");
  const cnt = u16(d, eo + 10); let p = u32(d, eo + 16);
  if (cnt === 0xffff || p === 0xffffffff) throw new ImportError("bad-xlsx"); // zip64: unsupported
  if (cnt > LIMITS.maxZipEntries) throw new ImportError("limit-size");
  const dec = new TextDecoder(); const out: Record<string, Uint8Array> = {}; let total = 0;
  for (let n = 0; n < cnt; n++) {
    if (p + 46 > d.length || u32(d, p) !== 0x02014b50) break;
    const flags = u16(d, p + 8), method = u16(d, p + 10), csize = u32(d, p + 20), usize = u32(d, p + 24);
    const nameLen = u16(d, p + 28), extraLen = u16(d, p + 30), cmtLen = u16(d, p + 32), lho = u32(d, p + 42);
    if (p + 46 + nameLen > d.length) throw new ImportError("bad-xlsx");
    const name = dec.decode(d.subarray(p + 46, p + 46 + nameLen));
    p = p + 46 + nameLen + extraLen + cmtLen;
    if (!want(name)) continue;
    if (flags & 1) throw new ImportError("bad-xlsx"); // encrypted
    if (method !== 0 && method !== 8) throw new ImportError("bad-xlsx");
    if (csize === 0xffffffff || usize === 0xffffffff) throw new ImportError("bad-xlsx");
    if (usize > LIMITS.maxEntryBytes || total + usize > LIMITS.maxTotalBytes) throw new ImportError("limit-size");
    if (lho + 30 > d.length || u32(d, lho) !== 0x04034b50) throw new ImportError("bad-xlsx");
    const dataStart = lho + 30 + u16(d, lho + 26) + u16(d, lho + 28);
    if (dataStart + csize > d.length) throw new ImportError("bad-xlsx");
    const comp = d.subarray(dataStart, dataStart + csize);
    let data: Uint8Array;
    if (method === 0) { if (comp.length > LIMITS.maxEntryBytes) throw new ImportError("limit-size"); data = comp.slice(); }
    else data = await inflate(comp, Math.min(LIMITS.maxEntryBytes, LIMITS.maxTotalBytes - total)); // actual size enforced, not the declared one
    total += data.length;
    if (total > LIMITS.maxTotalBytes) throw new ImportError("limit-size");
    out[name] = data;
  }
  return out;
}

/* ---------------------------------- XLSX XML (no DOMParser: no entity expansion, no DOM) ---------------------------------- */
const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-z]{2,4});/g, (m, g: string) => {
    if (g[0] === "#") {
      const cp = g[1] === "x" ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : "";
    }
    return ENT[g] ?? m;
  });
}
const tTexts = (xml: string): string => {
  // concatenation of all <t>…</t> runs (source: si.getElementsByTagName('t'))
  let s = ""; const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g; let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) { s += decodeXml(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "")); if (s.length > LIMITS.maxCellChars * 4) break; }
  return s;
};
const attr = (tag: string, name: string): string => {
  const m = new RegExp("\\s" + name + "=(?:\"([^\"]*)\"|'([^']*)')").exec(tag);
  return m ? m[1] ?? m[2] ?? "" : "";
};
const colLetterIdx = (letters: string) => { let n = 0; for (let k = 0; k < letters.length; k++) n = n * 26 + (letters.charCodeAt(k) - 64); return n - 1; };

export function parseSharedStrings(xml: string): string[] {
  const out: string[] = []; const re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\s*\/>/g; let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    out.push(clampCell(m[1] == null ? "" : tTexts(m[1])));
    if (out.length > 1_000_000) throw new ImportError("limit-size");
  }
  return out;
}
export function parseSheetXml(xml: string, shared: string[]): string[][] {
  const out: string[][] = [];
  const rowRe = /<row(?:\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/row>)/g; let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    if (out.length >= LIMITS.maxScanRows) throw new ImportError("limit-rows");
    const cells: string[] = []; const inner = rm[1] || "";
    const cRe = /<c(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/c>)/g; let cm: RegExpExecArray | null;
    while ((cm = cRe.exec(inner))) {
      const open = cm[1] || ""; const body = cm[2] || "";
      const ref = attr(open, "r"); const t = attr(open, "t");
      const letters = ref.replace(/[0-9]+/g, "").toUpperCase();
      if (letters && !/^[A-Z]{1,3}$/.test(letters)) throw new ImportError("bad-xlsx");
      const col = colLetterIdx(letters || "A");
      if (col >= LIMITS.maxCols) { if (body.replace(/<[^>]*>/g, "").trim() !== "") throw new ImportError("limit-cols"); continue; }
      let val = "";
      if (t === "inlineStr") { const is = /<is(?:\s[^>]*)?>([\s\S]*?)<\/is>/.exec(body); val = is ? tTexts(is[1]) : ""; }
      else {
        const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body); const raw = v ? decodeXml(v[1]) : "";
        val = t === "s" ? shared[+raw] || "" : raw; // formula cells: only the cached <v> value is read; <f> is ignored (never evaluated)
      }
      cells[col] = clampCell(val);
    }
    for (let x = 0; x < cells.length; x++) if (cells[x] == null) cells[x] = "";
    out.push(cells);
  }
  return out;
}

export async function readXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const isSheet = (n: string) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n);
  const files = await unzip(buf, (n) => isSheet(n) || n === "xl/sharedStrings.xml");
  const dec = new TextDecoder();
  const shared = files["xl/sharedStrings.xml"] ? parseSharedStrings(dec.decode(files["xl/sharedStrings.xml"])) : [];
  const sheets = Object.keys(files).filter(isSheet).sort((a, b) => +(a.match(/(\d+)/) as RegExpMatchArray)[1] - +(b.match(/(\d+)/) as RegExpMatchArray)[1]);
  if (!sheets.length) throw new ImportError("bad-xlsx");
  return parseSheetXml(dec.decode(files[sheets[0]]), shared);
}

/* ---------------------------------- grid + auto-map ---------------------------------- */
export interface Grid { headers: string[]; rows: string[][] }

/** Source impSetGrid. Throws ImportError("no-data") when there is no data row; limits enforced. */
export function buildGrid(matrixIn: string[][]): Grid {
  const matrix = (matrixIn || []).filter((r) => r.some((c) => String(c == null ? "" : c).trim() !== ""));
  if (matrix.length < 2) throw new ImportError("no-data");
  if (matrix.length - 1 > LIMITS.maxRows) throw new ImportError("limit-rows");
  const colCount = matrix.reduce((mx, r) => Math.max(mx, r.length), 0);
  if (colCount > LIMITS.maxCols) throw new ImportError("limit-cols");
  const headers: string[] = [];
  for (let x = 0; x < colCount; x++) {
    const h = String(matrix[0][x] == null ? "" : matrix[0][x]).trim().slice(0, LIMITS.maxHeaderLen);
    headers.push(h || "Column " + (x + 1));
  }
  const rows = matrix.slice(1).map((r) => { const a = r.slice(); while (a.length < colCount) a.push(""); return a.slice(0, colCount).map((c) => String(c == null ? "" : c)); });
  return { headers, rows };
}

export interface ImpField { k: string; label: string; req: boolean; syn: string[] }
export const IMP_FIELDS: ImpField[] = [
  { k: "id", label: "Risk ID", req: false, syn: ["risk id", "id", "ref", "reference", "risk ref", "risk reference", "risk no", "risk number"] },
  { k: "title", label: "Risk title", req: true, syn: ["risk", "title", "risk title", "risk scenario", "scenario", "name", "risk name", "risk description", "summary"] },
  { k: "cat", label: "Category", req: false, syn: ["category", "cat", "type", "risk category", "risk type", "domain", "area"] },
  { k: "owner", label: "Owner", req: false, syn: ["owner", "risk owner", "accountable", "responsible", "assigned to", "assignee"] },
  { k: "l", label: "Likelihood", req: false, syn: ["likelihood", "probability", "inherent likelihood", "likelihood inherent", "frequency", "freq", "likely"] },
  { k: "i", label: "Impact", req: false, syn: ["impact", "consequence", "severity", "inherent impact", "impact inherent"] },
  { k: "rl", label: "Residual likelihood", req: false, syn: ["residual likelihood", "residual probability", "target likelihood", "post likelihood", "likelihood residual"] },
  { k: "ri", label: "Residual impact", req: false, syn: ["residual impact", "residual consequence", "target impact", "post impact", "impact residual"] },
  { k: "treat", label: "Treatment", req: false, syn: ["treatment", "response", "treatment decision", "strategy", "risk response", "treatment strategy"] },
  { k: "status", label: "Status", req: false, syn: ["status", "state", "risk status"] },
  { k: "due", label: "Due date", req: false, syn: ["due", "due date", "target date", "treatment due", "remediation date", "deadline"] },
  { k: "controls", label: "Controls", req: false, syn: ["controls", "existing controls", "control", "mitigations", "control mappings", "existing control"] },
];

export const normHdr = (s: unknown) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function autoMap(headers: string[]): { map: Record<string, number>; autoCount: number } {
  const hdr = headers.map(normHdr); const used: Record<number, 1> = {}; const map: Record<string, number> = {}; let auto = 0;
  IMP_FIELDS.forEach((f) => {
    let found = -1; const syn = f.syn.map(normHdr);
    for (let x = 0; x < hdr.length; x++) { if (used[x]) continue; if (syn.indexOf(hdr[x]) >= 0) { found = x; break; } } // exact
    if (found < 0) for (let x = 0; x < hdr.length; x++) { if (used[x]) continue; if (hdr[x] && syn.some((s) => s.length > 2 && (hdr[x] === s || (" " + hdr[x] + " ").indexOf(" " + s + " ") >= 0))) { found = x; break; } } // word/phrase
    map[f.k] = found; if (found >= 0) { used[found] = 1; auto++; }
  });
  return { map, autoCount: auto };
}
