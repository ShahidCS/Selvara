import { describe, expect, it } from "vitest";
import { greetingFor, longDate, postureEyebrow } from "@/lib/greeting";

/* The Overview's date line: weekday, two-digit day, month in words and year, in the person's time zone, then what the page shows. */
describe("Overview date line", () => {
  const at = new Date(Date.UTC(2026, 10, 26, 22, 30)); // 26 November 2026, 22:30 UTC
  it("formats weekday, DD Month YYYY with a comma after the weekday", () => {
    expect(longDate(at, "UTC")).toBe("Thursday, 26 November 2026");
    expect(longDate(new Date(Date.UTC(2026, 0, 5, 12)), "UTC")).toBe("Monday, 05 January 2026"); // two-digit day
  });
  it("uses the person's time zone, not the server's", () => {
    expect(longDate(at, "Asia/Karachi")).toBe("Friday, 27 November 2026");          // UTC+5: already the next day
    expect(longDate(at, "America/Los_Angeles")).toBe("Thursday, 26 November 2026");
  });
  it("falls back to the browser's zone for an unknown zone instead of failing", () => {
    expect(longDate(at, "Not/AZone")).toBe(longDate(at));
  });
  it("names the posture once and does not repeat the month", () => {
    const line = postureEyebrow(at, "UTC");
    expect(line).toBe("Thursday, 26 November 2026 · Overall Security Posture");
    expect(line.match(/November/g)).toHaveLength(1);
  });
  it("keeps the greeting rules", () => { expect([greetingFor(2), greetingFor(9), greetingFor(14), greetingFor(20)]).toEqual(["Hello", "Good Morning", "Good Afternoon", "Good Evening"]); });
});
