import { describe, expect, it } from "vitest";
import { POLICY, checkPassword, containsContext, isCommon, isTrivial } from "@/lib/credentials";

const ctx = { email: "jordan.avery@acme-widgets.example", name: "Jordan Avery", company: "Acme Widgets" };

describe("checkPassword length", () => {
  it("rejects 11 characters and accepts 12", () => {
    expect(checkPassword("Xq7!mR2vLp4").ok).toBe(false);
    expect(checkPassword("Xq7!mR2vLp4").errors.join(" ")).toMatch(/at least 12/);
    expect(checkPassword("Xq7!mR2vLp4z").ok).toBe(true);
  });
  it("accepts 128 and rejects 129 characters", () => {
    const base = "plum-orbit-violet-anchor ";
    let pw = ""; while (pw.length < 129) pw += base;
    const exact = pw.slice(0, POLICY.maxLength);
    expect(Array.from(exact).length).toBe(128);
    expect(checkPassword(exact).errors.join(" ")).not.toMatch(/at most/);
    const over = exact + "x";
    expect(checkPassword(over).ok).toBe(false);
    expect(checkPassword(over).errors.join(" ")).toMatch(/at most 128/);
  });
  it("short-circuits absurdly long input", () => {
    expect(checkPassword("a".repeat(5000)).ok).toBe(false);
  });
  it("counts code points, not UTF-16 units", () => {
    // 12 emoji = 24 UTF-16 units but 12 code points; mixed so it is not trivial
    const pw = Array.from("🦊🌵🚲🍋🎻🧭🪁🍄🛶🔭🎲🥁").join("");
    expect(Array.from(pw).length).toBe(12);
    expect(checkPassword(pw).errors.join(" ")).not.toMatch(/at least/);
    expect(checkPassword(Array.from(pw).slice(0, 11).join("")).errors.join(" ")).toMatch(/at least 12/);
  });
});

describe("checkPassword character rules", () => {
  it("accepts Unicode passphrases and spaces", () => {
    expect(checkPassword("хорошая погода сегодня").ok).toBe(true);
    expect(checkPassword("mulberry lanterns quietly ferrying").ok).toBe(true);
    expect(checkPassword("correct horse battery staple").ok).toBe(false); // famous passphrase is on the breached list
    expect(checkPassword("今日はとても良い天気ですね").ok).toBe(true);
  });
  it("has no composition rules: lowercase only is fine when long and unusual", () => {
    expect(checkPassword("mulberry quietly ferrying lanterns").ok).toBe(true);
    expect(checkPassword("vxqjzkwplmnrtbsd").ok).toBe(true);
  });
  it("rejects common and breached passwords even when composition-compliant", () => {
    for (const pw of ["Password123!", "password1234", "qwertyuiop12", "letmein123456", "iloveyou1234"]) {
      const r = checkPassword(pw);
      expect(r.ok, pw).toBe(false);
    }
    expect(checkPassword("Password123!").errors.join(" ")).toMatch(/common or breached/);
  });
  it("catches look-alike (leet) variants of common passwords", () => {
    expect(isCommon("P@ssw0rd")).toBe(true);
  });
  it("rejects repeats and sequences", () => {
    expect(checkPassword("aaaaaaaaaaaa").errors.join(" ")).toMatch(/repeated/i);
    expect(checkPassword("abababababab").ok).toBe(false);
    expect(checkPassword("123456789012").ok).toBe(false);
    expect(checkPassword("abcdefghijkl").ok).toBe(false);
    expect(checkPassword("qwertyuiopas").ok).toBe(false);
    expect(isTrivial("zyxwvutsrqpo")).toBe(true);
    expect(isTrivial("plum orbit violet")).toBe(false);
  });
  it("rejects values containing the email local part, name or company", () => {
    expect(checkPassword("jordan.avery-7Xk!pz", ctx).errors.join(" ")).toMatch(/name, email or company/);
    expect(checkPassword("Xk9!averyQm2#zL", ctx).ok).toBe(false);
    expect(checkPassword("my-acme-widgets-rocks!", ctx).ok).toBe(false);
    expect(checkPassword("J0rd@n!Qm2#zLvb", ctx).ok).toBe(false); // look-alike spelling of "jordan"
    expect(checkPassword("Xk9!averyQm2#zL").ok).toBe(true); // same string, no context supplied
  });
  it("ignores context parts shorter than 4 characters", () => {
    expect(containsContext("xx-bob-zzzz-qq", { name: "Bob Li" })).toBe(false);
  });
  it("normalises with NFKC (full-width forms count as ASCII)", () => {
    const fullWidth = "ａｂｃｄｅｆｇｈｉｊｋｌ"; // fullwidth a..l = sequence after NFKC
    expect(checkPassword(fullWidth).ok).toBe(false);
  });
});

describe("checkPassword result shape", () => {
  it("returns an advisory score 0-4 and no errors for a good passphrase", () => {
    const r = checkPassword("lantern mulberry quietly ferrying");
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.score).toBeGreaterThanOrEqual(2);
    expect(r.score).toBeLessThanOrEqual(4);
  });
  it("scores a blocked password 0", () => expect(checkPassword("Password123!").score).toBe(0));
  it("handles empty / nullish input without throwing", () => {
    expect(checkPassword("").ok).toBe(false);
    expect(checkPassword(undefined as unknown as string).ok).toBe(false);
  });
});
