import { describe, expect, it } from "vitest";
import { DEFAULT_TEXT_PX, isLargeText } from "@/hooks/useLargeText";

/* EDGE-13: large text is a root font size (1rem) above the browser default of 16px; page zoom keeps 1rem at 16 CSS px. */
describe("EDGE-13: large text", () => {
  it("the default size and rounding are not large text", () => {
    expect(DEFAULT_TEXT_PX).toBe(16);
    for (const px of [12, 16, 16.4, 16.5]) expect(isLargeText(px), String(px)).toBe(false);
  });
  it("Chrome's Large and Very large settings are", () => {
    for (const px of [17, 20, 24, 32]) expect(isLargeText(px), String(px)).toBe(true);
  });
  it("an unreadable size is not", () => {
    expect(isLargeText(Number.NaN)).toBe(false);
  });
});
