import { describe, expect, it } from "vitest";
import { csvCell, esc, money, num } from "@/lib/format";

describe("csvCell", () => {
  it("quotes and doubles embedded quotes", () => {
    expect(csvCell("plain")).toBe('"plain"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("a,b\nc")).toBe('"a,b\nc"');
  });
  it("handles nullish and numbers", () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell(0)).toBe('"0"');
    expect(csvCell(12.5)).toBe('"12.5"');
  });
  it.each(["=SUM(A1)", "+1+1", "-2+3", "@cmd", "\tcmd", "\rcmd", '=HYPERLINK("http://203.0.113.1","x")', "=cmd|' /C calc'!A0"])(
    "guards formula-leading value %j", (v) => expect(csvCell(v)).toMatch(/^"'[=+\-@\t\r]/));
  it("does not alter values where the trigger is not the first character", () => expect(csvCell("a=b")).toBe('"a=b"'));
});

describe("esc", () => {
  it("escapes the five HTML metacharacters", () => expect(esc(`<img src=x onerror="a('b')">&`)).toBe("&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;"));
  it("handles nullish and non-strings", () => { expect(esc(null)).toBe(""); expect(esc(undefined)).toBe(""); expect(esc(5)).toBe("5"); });
  it("is not double-escaping aware: escaping twice escapes the ampersands", () => expect(esc(esc("<"))).toBe("&amp;lt;"));
  it("leaves the output free of raw angle brackets and quotes", () => expect(esc(`<script>"'</script>`)).not.toMatch(/[<>"']/));
});

describe("number formatting", () => {
  it("formats money and numbers", () => {
    expect(money(1234.5)).toBe("$1,234.50");
    expect(num(1234567)).toBe("1,234,567");
  });
});
