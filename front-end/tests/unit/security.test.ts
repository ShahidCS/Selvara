import { describe, expect, it } from "vitest";
import { clampText, isEmail, isIsoDate, isSafeWebhookUrl, logSafeUrl, safeFileName, safeHref, validateUpload } from "@/lib/security";

describe("safeHref", () => {
  it.each([
    ["https://example.com/a?b=1", "https://example.com/a?b=1"],
    ["http://example.com/", "http://example.com/"],
    ["mailto:a@example.com", "mailto:a@example.com"],
    ["/ws/overview", "/ws/overview"],
  ])("allows %s", (input, out) => expect(safeHref(input)).toBe(out));

  it.each([
    "javascript:alert(1)", " JaVaScRiPt:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:x", "file:///etc/passwd",
    "//evil.example/path", "", null, undefined, "not a url",
  ])("neutralises %s", (input) => expect(safeHref(input)).toBe("#"));
});

describe("safeFileName", () => {
  it("strips path separators, control chars and leading dots", () => {
    expect(safeFileName("../../etc/passwd")).toBe("_.._etc_passwd");
    expect(safeFileName("..\\..\\boot.ini")).toBe("_.._boot.ini");
    expect(safeFileName(".htaccess")).toBe("htaccess");
    expect(safeFileName("a\u0000b\u001fc.pdf")).toBe("abc.pdf");
    expect(safeFileName('we<ir>d:"na|me?*.txt')).toBe("weirdname.txt");
  });
  it("caps length and falls back", () => {
    expect(safeFileName("a".repeat(500)).length).toBe(120);
    expect(safeFileName("")).toBe("file");
    expect(safeFileName(null, "x")).toBe("x");
    expect(safeFileName("...")).toBe("file");
  });
});

describe("validateUpload", () => {
  const ok = { name: "report.pdf", size: 1024 };
  it("accepts an allowed type within the size limit", () => expect(validateUpload(ok)).toBeNull());
  it("is case-insensitive on the extension", () => expect(validateUpload({ name: "REPORT.PDF", size: 10 })).toBeNull());
  it("rejects a disallowed extension", () => {
    expect(validateUpload({ name: "evil.exe", size: 10 })).toMatch(/not allowed/);
    expect(validateUpload({ name: "x.html", size: 10 })).toMatch(/not allowed/);
    expect(validateUpload({ name: "noext", size: 10 })).toMatch(/not allowed/);
  });
  it("only the last extension counts (double extension)", () => expect(validateUpload({ name: "a.pdf.exe", size: 10 })).toMatch(/not allowed/));
  it("rejects oversize and empty files", () => {
    expect(validateUpload({ name: "a.pdf", size: 10 * 1024 * 1024 + 1 })).toMatch(/too large/);
    expect(validateUpload({ name: "a.pdf", size: 10 * 1024 * 1024 })).toBeNull();
    expect(validateUpload({ name: "a.pdf", size: 0 })).toBe("File is empty.");
  });
  it("honours a custom rule and mime allow-list", () => {
    const rule = { maxBytes: 100, exts: ["csv"], mimes: ["text/csv"] };
    expect(validateUpload({ name: "a.csv", size: 50, type: "text/csv" }, rule)).toBeNull();
    expect(validateUpload({ name: "a.csv", size: 50, type: "application/x-msdownload" }, rule)).toMatch(/content type/);
    expect(validateUpload({ name: "a.csv", size: 101 }, rule)).toMatch(/too large/);
    expect(validateUpload({ name: "a.pdf", size: 5 }, rule)).toMatch(/not allowed/);
  });
});

describe("clampText", () => {
  it("trims and caps", () => {
    expect(clampText("  hi  ")).toBe("hi");
    expect(clampText("abcdef", 3)).toBe("abc");
    expect(clampText(null)).toBe("");
    expect(clampText(undefined)).toBe("");
    expect(clampText(42)).toBe("42");
    expect(clampText("x".repeat(1000)).length).toBe(500);
  });
});

describe("isEmail", () => {
  it.each(["a@b.co", "first.last+tag@example.com", "contact@vendor.example"])("accepts %s", (v) => expect(isEmail(v)).toBe(true));
  it.each(["", "a", "a@b", "a@b.c", "a b@example.com", "<x>@example.com", "a@@example.com", "a@exa mple.com", "a".repeat(65) + "@example.com", "a@" + "b".repeat(250) + ".com"])(
    "rejects %s", (v) => expect(isEmail(v)).toBe(false));
});

describe("isIsoDate", () => {
  it("accepts real ISO dates", () => { expect(isIsoDate("2026-11-08")).toBe(true); expect(isIsoDate("2024-02-29")).toBe(true); });
  it.each(["", "2026-1-8", "08-11-2026", "2026/11/08", "2026-13-01", "2026-11-08T10:00:00Z", "abcd-ef-gh", "2026-11-088"])("rejects %s", (v) => expect(isIsoDate(v)).toBe(false));
});

describe("isSafeWebhookUrl", () => {
  it.each([
    "https://hooks.example.com/services/T000/B000", "https://example.com", "https://api.example.co.uk:8443/hook?x=1", "https://8.8.8.8/hook", "https://172.32.0.1/hook",
    "https://192.169.0.1/hook", "https://example.com./hook",
  ])("allows %s", (u) => expect(isSafeWebhookUrl(u)).toBe(true));

  it.each([
    ["http (not https)", "http://example.com/hook"],
    ["javascript:", "javascript:alert(1)"],
    ["ftp", "ftp://example.com/x"],
    ["localhost", "https://localhost/hook"],
    ["localhost with port", "https://localhost:3000/hook"],
    ["subdomain of localhost", "https://app.localhost/hook"],
    ["127.0.0.1", "https://127.0.0.1/hook"],
    ["127.x loopback range", "https://127.1.2.3/hook"],
    ["0.0.0.0", "https://0.0.0.0/hook"],
    ["cloud metadata 169.254.169.254", "https://169.254.169.254/latest/meta-data/"],
    ["10.0.0.0/8", "https://10.1.2.3/hook"],
    ["172.16.0.0/12 low", "https://172.16.0.1/hook"],
    ["172.16.0.0/12 high", "https://172.31.255.255/hook"],
    ["192.168.0.0/16", "https://192.168.1.10/hook"],
    ["CGNAT 100.64/10", "https://100.64.0.1/hook"],
    ["multicast", "https://224.0.0.1/hook"],
    ["IPv6 loopback literal", "https://[::1]/hook"],
    ["IPv6 literal", "https://[2001:db8::1]/hook"],
    ["IPv4-mapped IPv6 literal", "https://[::ffff:127.0.0.1]/hook"],
    ["decimal IP", "https://2130706433/hook"],
    ["hex IP", "https://0x7f000001/hook"],
    ["octal-ish IP", "https://0177.0.0.1/hook"],
    ["credentials in URL", "https://user:pass@example.com/hook"],
    ["username only", "https://user@example.com/hook"],
    [".internal name", "https://db.internal/hook"],
    [".local name", "https://printer.local/hook"],
    ["single-label host", "https://intranet/hook"],
    ["whitespace in URL", "https://example.com/a b"],
    ["control char", "https://example.com/\u0000"],
    ["empty", ""],
    ["garbage", "not a url"],
    ["too long", "https://example.com/" + "a".repeat(2100)],
  ])("rejects %s", (_n, u) => expect(isSafeWebhookUrl(u)).toBe(false));

  it("rejects non-strings", () => { expect(isSafeWebhookUrl(null)).toBe(false); expect(isSafeWebhookUrl(undefined)).toBe(false); expect(isSafeWebhookUrl(123)).toBe(false); });
});

describe("logSafeUrl", () => {
  it("drops query and fragment", () => expect(logSafeUrl("https://example.com/hook?token=SECRET#frag")).toBe("https://example.com/hook"));
  it("clamps a non-URL", () => expect(logSafeUrl("x".repeat(500)).length).toBe(200));
});
