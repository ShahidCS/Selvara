import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hotp, newSecret, otpauthUri, totpAt, verifyTotp } from "@/lib/totp";

/* RFC 6238 appendix B (SHA-1, secret "12345678901234567890") and RFC 4226 appendix D. */
const RFC_SECRET = base32Encode(new TextEncoder().encode("12345678901234567890"));
describe("TOTP", () => {
  it("matches the RFC 4226 HOTP vectors", async () => {
    const key = new TextEncoder().encode("12345678901234567890");
    const want = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    for (let i = 0; i < want.length; i++) expect(await hotp(key, i)).toBe(want[i]);
  });
  it("matches the RFC 6238 SHA-1 vectors (8 digits)", async () => {
    const cases: [number, string][] = [[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"]];
    for (const [t, code] of cases) expect(await totpAt(RFC_SECRET, t * 1000, 8)).toBe(code);
  });
  it("round-trips base32 and makes 160-bit secrets", () => {
    const s = newSecret(); expect(s).toMatch(/^[A-Z2-7]{32}$/); expect(base32Decode(s).length).toBe(20);
    expect(base32Encode(base32Decode("JBSWY3DPEHPK3PXP"))).toBe("JBSWY3DPEHPK3PXP");
  });
  it("accepts one step of drift, refuses older steps and replays", async () => {
    const now = 1_700_000_000_000; const s = newSecret();
    const prev = await totpAt(s, now - 30_000); const cur = await totpAt(s, now); const old = await totpAt(s, now - 90_000);
    const step = await verifyTotp(s, cur, -1, now); expect(step).not.toBeNull();
    expect(await verifyTotp(s, prev, -1, now)).not.toBeNull();
    expect(await verifyTotp(s, old, -1, now)).toBeNull();
    expect(await verifyTotp(s, cur, step!, now)).toBeNull(); // used already
    expect(await verifyTotp(s, "12345", -1, now)).toBeNull();
  });
  it("builds an otpauth link without leaking anything but the secret it carries", () => {
    expect(otpauthUri("JBSWY3DPEHPK3PXP", "alex.kim@company.example")).toBe("otpauth://totp/Selvara:alex.kim%40company.example?secret=JBSWY3DPEHPK3PXP&issuer=Selvara&algorithm=SHA1&digits=6&period=30");
  });
});
