import { describe, expect, it } from "vitest";
import { deflateRawSync, deflateSync } from "node:zlib";
import { DocError, docxXmlToText, extractText, pdfContentText } from "@/lib/docText";
import { PREFILL_FORMS, checkValue, checkValues, prefillFromText } from "@/lib/prefill";
import { RISK_CATS, RISK_TREATS } from "@/lib/risk";
import { VENDOR_TIERS } from "@/features/vendors/lib/vendors";

/* Reference review R27: reading a document in the browser and filling a form from it. Synthetic documents only. */
const enc = (s: string) => new TextEncoder().encode(s);
/** A minimal zip with one deflated entry (as a .docx holds word/document.xml). */
function zip(name: string, content: Uint8Array, opts: { claimSize?: number } = {}) {
  const data = deflateRawSync(content); const n = enc(name);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(opts.claimSize ?? content.length, 22); local.writeUInt16LE(n.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(opts.claimSize ?? content.length, 24); cd.writeUInt16LE(n.length, 28); cd.writeUInt32LE(0, 42);
  const cdOff = 30 + n.length + data.length; const cdLen = 46 + n.length;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(cdLen, 12); end.writeUInt32LE(cdOff, 16);
  return new Uint8Array(Buffer.concat([local, n, data, cd, n, end]));
}
const W = (body: string) => `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`;
const P = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
/** A one-page PDF whose content stream is deflated, with the text shown by Tj and TJ. */
function pdf(content: string, extra = "") {
  const z = deflateSync(Buffer.from(content, "latin1"));
  return new Uint8Array(Buffer.concat([Buffer.from(`%PDF-1.7\n1 0 obj\n<< /Type /Catalog ${extra}>>\nendobj\n4 0 obj\n<< /Length ${z.length} /Filter /FlateDecode >>\nstream\n`, "latin1"), z, Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1")]));
}

describe("document text (lib/docText.ts)", () => {
  it("reads plain text and refuses unknown types, empty and oversized files", async () => {
    expect((await extractText("v.txt", enc("﻿Vendor name: Acme Cloud\r\nTier: Critical"))).text).toBe("Vendor name: Acme Cloud\nTier: Critical");
    await expect(extractText("v.exe", enc("x"))).rejects.toThrow(DocError);
    await expect(extractText("v.txt", new Uint8Array(0))).rejects.toThrow(/empty/);
    await expect(extractText("v.txt", new Uint8Array(5 * 1024 * 1024 + 1))).rejects.toThrow(/5 MB/);
  });
  it("reads a Word document: paragraphs as lines, a two-column table row as label<TAB>value, entities decoded", async () => {
    const xml = W(`${P("Supplier profile")}<w:tbl><w:tr><w:tc>${P("Vendor name")}</w:tc><w:tc>${P("Acme &amp; Sons")}</w:tc></w:tr><w:tr><w:tc>${P("Tier")}</w:tc><w:tc>${P("Critical")}</w:tc></w:tr></w:tbl>`);
    expect(docxXmlToText(xml)).toContain("Vendor name\tAcme & Sons\n");
    const r = await extractText("profile.docx", zip("word/document.xml", enc(xml)));
    expect(r.kind).toBe("docx"); expect(prefillFromText(r.text, PREFILL_FORMS.vendor)).toEqual({ name: "Acme & Sons", tier: "Critical" });
  });
  it("refuses a Word file that is not a zip, has no document, or claims to expand beyond the limit", async () => {
    await expect(extractText("x.docx", enc("hello there, not a zip"))).rejects.toThrow(/does not look like a Word/);
    await expect(extractText("x.docx", zip("word/other.xml", enc(W(P("x")))))).rejects.toThrow(/no document text/);
    await expect(extractText("x.docx", zip("word/document.xml", enc(W(P("x"))), { claimSize: 9 * 1024 * 1024 }))).rejects.toThrow(/8 MB/);
    // a real bomb: small compressed, large inflated; stopped while inflating even when the header lies
    const big = new Uint8Array(9 * 1024 * 1024).fill(65);
    await expect(extractText("x.docx", zip("word/document.xml", big, { claimSize: 1000 }))).rejects.toThrow(/8 MB/);
  });
  it("reads a PDF's text operators (Tj, TJ with spacing, line moves, escapes) and refuses non-PDFs and encrypted ones", async () => {
    expect(pdfContentText("BT /F1 12 Tf 72 720 Td (Vendor name: Acme \\(EU\\)) Tj 0 -14 Td [(Ti) -20 (er: Cri) 10 (tical)] TJ T* [(Risk) -300 (score: 64)] TJ ET")).toBe("Vendor name: Acme (EU)\nTier: Critical\nRisk score: 64\n");
    const r = await extractText("q.pdf", pdf("BT /F1 12 Tf 72 720 Td (Vendor name: Acme Cloud) Tj 0 -14 Td (Category: Messaging) Tj ET"));
    expect(prefillFromText(r.text, PREFILL_FORMS.vendor)).toEqual({ name: "Acme Cloud", cat: "Messaging" });
    await expect(extractText("q.pdf", enc("not a pdf at all, really"))).rejects.toThrow(/does not look like a PDF/);
    await expect(extractText("q.pdf", pdf("BT (Secret) Tj ET", "/Encrypt 9 0 R "))).rejects.toThrow(/password protected/);
    await expect(extractText("q.pdf", pdf("q 1 0 0 1 0 0 cm Q"))).rejects.toThrow(/No readable text/);
  });
});

describe("prefill rules (lib/prefill.ts)", () => {
  it("keeps the field options in step with the forms", () => {
    const opts = (form: "vendor" | "risk", key: string) => { const k = PREFILL_FORMS[form].find((f) => f.key === key)!.kind; return k.type === "choice" ? [...k.options] : []; };
    expect(opts("vendor", "tier")).toEqual(VENDOR_TIERS); expect(opts("risk", "cat")).toEqual(RISK_CATS); expect(opts("risk", "treat")).toEqual(RISK_TREATS);
  });
  it("matches labels by their longest name, checks each value and never fills a masked placeholder", () => {
    const v = prefillFromText("Risk title: Legacy VPN without MFA\nLikelihood: Likely\nImpact - 5 (severe)\nResidual likelihood: 2\nResidual impact: minor\nTreatment: mitigate\nCategory: Spaceflight\nDescription: [PERSON] said so", PREFILL_FORMS.risk);
    expect(v).toEqual({ title: "Legacy VPN without MFA", l: "4", i: "5", rl: "2", ri: "2", treat: "Mitigate" });
    expect(checkValue(PREFILL_FORMS.vendor[3], "score 82 of 100")).toBe("82");
    expect(checkValue(PREFILL_FORMS.vendor[3], "140")).toBeNull();
    expect(checkValues(PREFILL_FORMS.vendor, { name: "  Acme   Cloud ", tier: "high", other: "x" })).toEqual({ name: "Acme Cloud" });
  });
});
