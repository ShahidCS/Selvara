/* Server-only. SEC-18 phase A: active-content checks on every uploaded file, run before it is stored (no new dependency, no outside service).
   Signature scanning (ClamAV) is phase B, on a separate host (docs/security/RECOMMENDATIONS-2026-11-26.md). These checks refuse what makes a
   document dangerous whatever the malware family: code that runs when it is opened, objects that are not documents, links that fetch content
   from elsewhere, and files built to exhaust the reader. They fail closed: a file that cannot be read completely is refused.

   Checked by type (after checkFile has confirmed the extension, size and that the content matches the extension):
   - Every file: the EICAR anti-virus test string (to prove the refusal path end to end).
   - docx, xlsx (ZIP containers): macros (vbaProject.bin, macro-enabled content types), ActiveX, OLE objects and embedded files other than
     plain Office documents and images (embedded Office documents are checked the same way, two levels deep), relationships to outside
     resources other than hyperlinks (remote templates, external images and frames, external workbook links), DDE fields and DDE links, and
     ZIP bombs (too many entries, or too large when expanded).
   - pdf: JavaScript, launch actions, attached files, rich media (Flash) and XFA forms, including inside compressed object streams; names
     written with #xx escapes are decoded first. An encrypted PDF whose objects are compressed cannot be read, so it is refused.
   - png, jpeg: pictures over 40 megapixels or 20,000 pixels on a side (decompression bombs).
   - csv: cells that a spreadsheet would run as a formula or a DDE command. */
import { inflateRawSync, inflateSync } from "node:zlib";

/** Why the file is refused (completes "This file was refused because ..."), or null when it is clean. */
export type ScanResult = string | null;

const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
const MAX_ENTRIES = 2_000;
const MAX_EXPANDED = 64 * 1024 * 1024; // the whole container, expanded
const MAX_PART = 16 * 1024 * 1024; // one part we read, expanded
const MAX_DEPTH = 2;
const latin1 = (b: Uint8Array) => Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString("latin1");

export function activeContent(ext: string, bytes: Uint8Array): ScanResult {
  try {
    if (latin1(bytes).includes(EICAR)) return "it matches the EICAR anti-virus test file";
    if (ext === "docx" || ext === "xlsx") return office(bytes, 0);
    if (ext === "pdf") return pdf(bytes);
    if (ext === "png") return png(bytes);
    if (ext === "jpg" || ext === "jpeg") return jpeg(bytes);
    if (ext === "csv") return csv(new TextDecoder().decode(bytes));
    return null;
  } catch (e) {
    return e instanceof RangeError ? "it expands to an unsafe size" : "it could not be checked completely";
  }
}

/* ---- ZIP (Office Open XML) ---- */
interface Entry { name: string; method: number; size: number; packed: number; local: number }
function entries(b: Uint8Array): Entry[] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65_535); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("no central directory");
  const count = v.getUint16(eocd + 10, true); let p = v.getUint32(eocd + 16, true);
  if (count === 0xffff || p === 0xffffffff) throw new Error("zip64");
  if (count > MAX_ENTRIES) throw new RangeError("entries");
  const out: Entry[] = []; let total = 0;
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error("bad central entry");
    const method = v.getUint16(p + 10, true), packed = v.getUint32(p + 20, true), size = v.getUint32(p + 24, true);
    const nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), local = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl));
    total += size; if (total > MAX_EXPANDED) throw new RangeError("expanded");
    out.push({ name, method, size, packed, local });
    p += 46 + nl + xl + cl;
  }
  return out;
}
function read(b: Uint8Array, e: Entry): Uint8Array {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (v.getUint32(e.local, true) !== 0x04034b50) throw new Error("bad local entry");
  const start = e.local + 30 + v.getUint16(e.local + 26, true) + v.getUint16(e.local + 28, true);
  const data = b.subarray(start, start + e.packed);
  if (e.method === 0) return data;
  if (e.method === 8) return inflateRawSync(data, { maxOutputLength: MAX_PART });
  throw new Error("compression method");
}
const OFFICE_DOC = /\.(docx|xlsx|pptx)$/i;
const PICTURE = /\.(png|jpe?g|gif|bmp|tiff?|emf|wmf|svg)$/i;
function office(b: Uint8Array, depth: number): ScanResult {
  const list = entries(b); const text = (e: Entry) => new TextDecoder().decode(read(b, e));
  const types = list.find((e) => e.name === "[Content_Types].xml");
  if (!types) return "it is not a complete Office document";
  if (/macroEnabled/i.test(text(types))) return "it contains macros";
  for (const e of list) {
    const n = e.name.toLowerCase();
    if (/vbaproject\.bin$|vbadata\.xml$/.test(n)) return "it contains macros";
    if (/(^|\/)activex\//.test(n)) return "it contains ActiveX controls";
    if (/oleobject\d*\.bin$/.test(n)) return "it contains embedded OLE objects";
    if (/(^|\/)embeddings\//.test(n) && !n.endsWith("/")) {
      if (OFFICE_DOC.test(n)) {
        if (depth >= MAX_DEPTH) return "it nests documents too deeply to check";
        const inner = office(read(b, e), depth + 1); if (inner) return inner;
      } else if (!PICTURE.test(n)) return "it contains an embedded file that is not a document or picture";
    }
    if (n.endsWith(".rels")) {
      const xml = text(e);
      for (const rel of xml.match(/<Relationship\b[^>]*>/g) ?? []) {
        if (!/TargetMode\s*=\s*["']External["']/i.test(rel)) continue;
        if (!/Type\s*=\s*["'][^"']*\/hyperlink["']/i.test(rel)) return "it loads content from outside the file (for example a remote template or linked file)";
      }
    }
    if (/^xl\/externallinks\/[^/]+\.xml$/.test(n) && /<ddeLink\b/i.test(text(e))) return "it contains a DDE link";
    if (/^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(n)) {
      const xml = text(e);
      const fields = [...xml.matchAll(/<w:instrText\b[^>]*>([^<]*)</g)].map((m) => m[1]).join(" ") + " " + [...xml.matchAll(/w:instr\s*=\s*"([^"]*)"/g)].map((m) => m[1]).join(" ");
      if (/\bDDE(AUTO)?\b/i.test(fields)) return "it contains a DDE field";
    }
  }
  return null;
}

/* ---- PDF ---- */
const PDF_ACTIVE: [RegExp, string][] = [
  [/\/(JavaScript|JS)\b/, "it contains JavaScript"],
  [/\/Launch\b/, "it can launch programs"],
  [/\/EmbeddedFiles?\b/, "it has attached files"],
  [/\/RichMedia\b/, "it contains rich media (Flash)"],
  [/\/XFA\b/, "it uses XFA forms"],
];
/** PDF names may spell letters as #xx (/J#61vaScript); decode them so the checks see the real name. */
const pdfNames = (s: string) => s.replace(/\/[^\s/<>[\]()%]+/g, (n) => n.replace(/#([0-9a-fA-F]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16))));
function pdfFlags(s: string): ScanResult { const t = pdfNames(s); for (const [re, why] of PDF_ACTIVE) if (re.test(t)) return why; return null; }
function pdf(b: Uint8Array): ScanResult {
  const s = latin1(b);
  // Dictionaries outside streams (stream bodies are binary and would match by chance).
  const top = pdfFlags(s.replace(/stream\r?\n[\s\S]*?endstream/g, "stream endstream")); if (top) return top;
  // Object streams hold more dictionaries in compressed form: expand each and check it too.
  const named = pdfNames(s);
  const objStms = s.match(/\/ObjStm\b/g)?.length ?? 0;
  if ((named.match(/\/ObjStm\b/g)?.length ?? 0) !== objStms) return "it hides its structure, so it could not be checked";
  if (!objStms) return null;
  if (/\/Encrypt\b/.test(named)) return "it is encrypted, so it could not be checked (save an unencrypted copy)";
  let expanded = 0;
  for (let at = s.indexOf("/ObjStm"); at >= 0; at = s.indexOf("/ObjStm", at + 7)) {
    const kw = /stream\r?\n/g; kw.lastIndex = at; const m = kw.exec(s);
    if (!m) return "it could not be checked completely";
    const dict = s.slice(Math.max(0, s.lastIndexOf(" obj", at)), m.index);
    const filters = (dict.match(/\/Filter\s*(\[[^\]]*\]|\/\w+)/)?.[1] ?? "").trim();
    const len = Number(dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/)?.[1] ?? NaN);
    const start = m.index + m[0].length; const end = Number.isFinite(len) ? start + len : s.indexOf("endstream", start);
    if (end < start || end > s.length) return "it could not be checked completely";
    const raw = b.subarray(start, end);
    let body: Uint8Array;
    if (!filters) body = raw;
    else if (/^(\/FlateDecode|\[\s*\/FlateDecode\s*\])$/.test(filters)) body = inflateSync(raw, { maxOutputLength: MAX_PART });
    else return "it uses a compression that could not be checked";
    expanded += body.length; if (expanded > MAX_EXPANDED) throw new RangeError("pdf expanded");
    const inner = pdfFlags(latin1(body)); if (inner) return inner;
  }
  return null;
}

/* ---- images ---- */
const MAX_PIXELS = 40_000_000, MAX_SIDE = 20_000;
const tooBig = (w: number, h: number): ScanResult => (w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_PIXELS ? "the picture is too large to open safely" : null);
function png(b: Uint8Array): ScanResult {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 24 || latin1(b.subarray(12, 16)) !== "IHDR") return "it is not a complete PNG picture";
  return tooBig(v.getUint32(16), v.getUint32(20));
}
function jpeg(b: Uint8Array): ScanResult {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength); let p = 2;
  while (p + 9 < b.length) {
    if (b[p] !== 0xff) { p++; continue; }
    const marker = b[p + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) { p += marker === 0xff ? 1 : 2; continue; }
    const len = v.getUint16(p + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return tooBig(v.getUint16(p + 7), v.getUint16(p + 5));
    p += 2 + len;
  }
  return "it is not a complete JPEG picture";
}

/* ---- csv ---- */
/** A cell that a spreadsheet would treat as a formula: starting with = or @, or + / - followed by a function call or a DDE pipe. */
const FORMULA = /^\s*["']?\s*(?:[=@]|[+-]\s*[A-Za-z_][\w.]*\s*[(|!])/;
function csv(s: string): ScanResult {
  for (const line of s.split(/\r?\n/)) for (const cell of line.split(/[,;\t]/)) if (FORMULA.test(cell)) return "a cell contains a spreadsheet formula (formulas can run commands when the file is opened)";
  return null;
}
