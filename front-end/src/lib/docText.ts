/* Text from an uploaded document, read in the browser (reference review R27: prefill a form from a document). No dependency: plain text is
   decoded, a Word file (.docx) is unzipped with the platform's DecompressionStream and its word/document.xml stripped to text, and a PDF's
   content streams are inflated and their text operators read. The file never leaves the browser; only the text may be sent, on request,
   to the Assistant on the server (which checks it for personal data first).
   Limits: 5 MB per file; at most 8 MB inflated in total (a zip or stream that expands further is refused); 50,000 characters of text.
   The XML is read with regular expressions (no DTD, so no entity expansion). Scanned PDFs and PDFs whose fonts map glyphs without a text
   encoding have no readable text: the caller is told so and can paste the text instead. */

export const DOC_MAX_BYTES = 5 * 1024 * 1024;
const INFLATE_MAX = 8 * 1024 * 1024;
export const TEXT_MAX = 50_000;
export const DOC_ACCEPT = ".pdf,.docx,.txt,.md,.csv";
export class DocError extends Error {}

export type DocKind = "pdf" | "docx" | "text";
export function kindOf(name: string): DocKind | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  return ext === "pdf" ? "pdf" : ext === "docx" ? "docx" : ext === "txt" || ext === "md" || ext === "csv" ? "text" : null;
}

/** Inflates zlib ("deflate") or raw deflate data, stopping at `budget.left` bytes. Trailing bytes after the end are ignored (common in PDFs). */
async function inflate(data: Uint8Array, format: "deflate" | "deflate-raw", budget: { left: number }): Promise<Uint8Array> {
  const reader = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream(format)).getReader();
  const parts: Uint8Array[] = []; let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.length; budget.left -= value.length;
      if (budget.left < 0) { void reader.cancel().catch(() => undefined); throw new DocError("The document expands to more than 8 MB, so it was not read."); }
      parts.push(value);
    }
  } catch (e) {
    if (e instanceof DocError) throw e;
    // a corrupt or padded stream: keep what was inflated before the error
  }
  const out = new Uint8Array(total); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

const latin1 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return s; };
const tidy = (s: string) => s.replace(/\r\n?/g, "\n").replace(/[ \t ]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[  ]{2,}/g, " ").trim().slice(0, TEXT_MAX);

/* ---- .docx ---- */
const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
/** One entry of a zip file, found through the central directory. */
async function zipEntry(b: Uint8Array, want: string, budget: { left: number }): Promise<Uint8Array | null> {
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new DocError("This Word file is damaged (no zip directory).");
  const count = u16(b, eocd + 10); let p = u32(b, eocd + 16);
  for (let k = 0; k < count && p + 46 <= b.length; k++) {
    if (u32(b, p) !== 0x02014b50) break;
    const method = u16(b, p + 10); const csize = u32(b, p + 20); const usize = u32(b, p + 24);
    const nlen = u16(b, p + 28); const elen = u16(b, p + 30); const clen = u16(b, p + 32); const local = u32(b, p + 42);
    const name = latin1(b.subarray(p + 46, p + 46 + nlen));
    if (name === want) {
      if (usize > budget.left) throw new DocError("The document expands to more than 8 MB, so it was not read.");
      if (local + 30 > b.length || u32(b, local) !== 0x04034b50) throw new DocError("This Word file is damaged.");
      const start = local + 30 + u16(b, local + 26) + u16(b, local + 28); const data = b.subarray(start, start + csize);
      if (method === 0) { budget.left -= data.length; return data; }
      if (method === 8) return inflate(data, "deflate-raw", budget);
      throw new DocError("This Word file uses a compression method that cannot be read.");
    }
    p += 46 + nlen + elen + clen;
  }
  return null;
}
const ENT: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const decodeEntities = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""; }
  return ENT[e.toLowerCase()] ?? m;
});
/** word/document.xml to text: paragraphs become lines; a table row becomes "cell<TAB>cell", so "Label | value" tables read like "Label: value". */
export function docxXmlToText(xml: string): string {
  const s = xml
    .replace(/<w:instrText[^>]*>[\s\S]*?<\/w:instrText>/g, "")
    .replace(/<w:tc[ >][\s\S]*?<\/w:tc>/g, (cell) => `${cell.replace(/<\/w:p>/g, " ")}\t`)
    .replace(/<\/w:tr>/g, "\n").replace(/<w:tab\/>/g, "\t").replace(/<w:br[^>]*\/>/g, "\n").replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(s).replace(/[ ]*\t[ \t]*/g, "\t").replace(/\t+\n/g, "\n");
}
async function docxText(b: Uint8Array): Promise<string> {
  if (u32(b, 0) !== 0x04034b50) throw new DocError("This file does not look like a Word (.docx) document.");
  const budget = { left: INFLATE_MAX };
  const xml = await zipEntry(b, "word/document.xml", budget);
  if (!xml) throw new DocError("This Word file has no document text.");
  return docxXmlToText(new TextDecoder("utf-8").decode(xml));
}

/* ---- PDF ---- */
const ESC: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
/** A PDF string's bytes as text: UTF-16BE when it starts with a byte-order mark, else one byte per character. */
const pdfStr = (raw: string) => {
  if (raw.charCodeAt(0) === 0xfe && raw.charCodeAt(1) === 0xff) { let o = ""; for (let i = 2; i + 1 < raw.length; i += 2) o += String.fromCharCode((raw.charCodeAt(i) << 8) | raw.charCodeAt(i + 1)); return o; }
  return raw;
};
/** Reads the text-showing operators (Tj, TJ, ' and ") of one content stream, with line breaks from T*, Td/TD, Tm and ET. */
export function pdfContentText(c: string): string {
  let out = ""; let i = 0; const ops: (string | number | { arr: (string | number)[] })[] = []; let arr: (string | number)[] | null = null;
  const push = (v: string | number) => (arr ? arr.push(v) : ops.push(v));
  const nl = () => { if (out && !out.endsWith("\n")) out += "\n"; };
  while (i < c.length) {
    const ch = c[i];
    if (ch === "(") {
      let depth = 1; let s = ""; i++;
      while (i < c.length && depth) {
        const x = c[i];
        if (x === "\\") {
          const n = c[i + 1];
          if (n !== undefined && /[0-7]/.test(n)) { const m = /^[0-7]{1,3}/.exec(c.slice(i + 1, i + 4))![0]; s += String.fromCharCode(parseInt(m, 8) & 0xff); i += 1 + m.length; continue; }
          if (n === "\r" || n === "\n") { i += n === "\r" && c[i + 2] === "\n" ? 3 : 2; continue; }
          s += n !== undefined ? ESC[n] ?? n : ""; i += 2; continue;
        }
        if (x === "(") depth++; else if (x === ")" && --depth === 0) { i++; break; }
        s += x; i++;
      }
      push(pdfStr(s)); continue;
    }
    if (ch === "<" && c[i + 1] !== "<") {
      const end = c.indexOf(">", i); const hex = c.slice(i + 1, end < 0 ? c.length : end).replace(/\s+/g, ""); i = end < 0 ? c.length : end + 1;
      let s = ""; for (let k = 0; k < hex.length; k += 2) s += String.fromCharCode(parseInt((hex[k] + (hex[k + 1] ?? "0")), 16)); push(pdfStr(s)); continue;
    }
    if (ch === "[") { arr = []; i++; continue; }
    if (ch === "]") { if (arr) ops.push({ arr }); arr = null; i++; continue; }
    if (ch === "%") { while (i < c.length && c[i] !== "\n" && c[i] !== "\r") i++; continue; }
    if (/\s/.test(ch) || ch === ">" || ch === "{" || ch === "}") { i++; continue; }
    let j = i; while (j < c.length && !/[\s()<>[\]{}/%]/.test(c[j])) j++;
    if (j === i) { // a name such as /F1
      j = i + 1; while (j < c.length && !/[\s()<>[\]{}/%]/.test(c[j])) j++;
      i = j; ops.push("/"); continue;
    }
    const tok = c.slice(i, j); i = j;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok)) { push(Number(tok)); continue; }
    const lastStr = () => { for (let k = ops.length - 1; k >= 0; k--) if (typeof ops[k] === "string" && ops[k] !== "/") return ops[k] as string; return ""; };
    if (tok === "Tj") out += lastStr();
    else if (tok === "'" || tok === '"') { nl(); out += lastStr(); }
    else if (tok === "TJ") {
      const a = ops.filter((o): o is { arr: (string | number)[] } => typeof o === "object").pop();
      if (a) for (const v of a.arr) out += typeof v === "string" ? v : v < -180 ? " " : "";
    } else if (tok === "T*" || tok === "ET") nl();
    else if (tok === "Td" || tok === "TD") { const nums = ops.filter((o): o is number => typeof o === "number"); const ty = nums[nums.length - 1] ?? 0; if (Math.abs(ty) > 0.5) nl(); else if (out && !/\s$/.test(out)) out += " "; }
    else if (tok === "Tm") nl();
    if (!/^[+-]?\d/.test(tok)) ops.length = 0;
  }
  return out;
}
const readable = (s: string) => { if (!s) return 0; let ok = 0; for (const ch of s) { const n = ch.charCodeAt(0); if ((n >= 32 && n < 127) || n === 9 || n === 10 || (n >= 160 && n < 0x2000) || (n >= 0x2010 && n < 0x2070)) ok++; } return ok / s.length; };
async function pdfText(b: Uint8Array): Promise<string> {
  const s = latin1(b);
  if (!s.startsWith("%PDF-")) throw new DocError("This file does not look like a PDF.");
  if (/\/Encrypt\s/.test(s)) throw new DocError("This PDF is password protected, so its text cannot be read.");
  const budget = { left: INFLATE_MAX }; let out = "";
  const re = /<<((?:[^<>]|<<(?:[^<>]|<<[^<>]*>>)*>>|<[^<>]*>)*)>>\s*stream(\r\n|\n|\r)/g; let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const dict = m[1]; const start = m.index + m[0].length; const end = s.indexOf("endstream", start); if (end < 0) break;
    re.lastIndex = end;
    if (/\/Subtype\s*\/(Image|Form)|\/Type\s*\/(XRef|ObjStm|XObject|Metadata)|\/Length1|\/FontFile/.test(dict)) continue;
    const filters = /\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(dict)?.[1] ?? "";
    let data = b.subarray(start, end);
    if (filters) { if (filters.replace(/[[\]\s]/g, "") !== "/FlateDecode") continue; data = await inflate(data, "deflate", budget); }
    const content = latin1(data);
    if (!/\bBT\b/.test(content)) continue;
    const t = pdfContentText(content);
    if (t.trim() && readable(t) >= 0.85) out += t + "\n";
    if (out.length > TEXT_MAX) break;
  }
  return out;
}

/** The text of an uploaded document, or a DocError that says why it could not be read (shown to the person as it is). */
export async function extractText(name: string, bytes: Uint8Array): Promise<{ kind: DocKind; text: string }> {
  const kind = kindOf(name);
  if (!kind) throw new DocError("Choose a PDF, Word (.docx) or text file.");
  if (bytes.length > DOC_MAX_BYTES) throw new DocError("The file is larger than 5 MB.");
  if (!bytes.length) throw new DocError("The file is empty.");
  const raw = kind === "text" ? new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "") : kind === "docx" ? await docxText(bytes) : await pdfText(bytes);
  const text = tidy(raw);
  if (text.replace(/\s/g, "").length < 10) throw new DocError(kind === "pdf" ? "No readable text was found in this PDF (it may be a scan or use fonts without a text map). Try a Word or text copy." : "No readable text was found in this file.");
  return { kind, text };
}
