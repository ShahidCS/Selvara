import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BRANDS, brandAttr, DEFAULT_BRAND, isBrand } from "@/lib/brand";
import { appStore } from "@/lib/store";
import { TEAM_SETTINGS, setBrand } from "@/services/team";

const css = readFileSync(join(__dirname, "../../src/styles/portal.css"), "utf8");
const decls = (block: string) => Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;}]+)/g)].map((m) => [m[1], m[2].trim()]));
const lum = (hex: string) => {
  const n = hex.replace("#", ""); const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const WHITE = "#ffffff";
const DARK_SURFACE = "#1e1e22", DARK_BG = "#111113", LIGHT_SUBTLE = "#f6f6f4";

/** The base (violet) values come from the root and dark-theme blocks, the presets from their own rules. */
function light(id: string) {
  const re = id === DEFAULT_BRAND ? /:root\{([^}]*--c-brand-500[^}]*)\}/ : new RegExp(`\\[data-brand="${id}"\\]\\{([^}]*)\\}`);
  const d = decls((css.match(re) || [])[1] || "");
  return { b50: d["--c-brand-50"], b500: d["--c-brand-500"], b600: d["--c-brand-600"] };
}
function dark(id: string) {
  const re = id === DEFAULT_BRAND ? /:root\[data-theme="dark"\]\{([^}]*)\}/ : new RegExp(`:root\\[data-brand="${id}"\\]\\[data-theme="dark"\\]\\{([^}]*)\\}`);
  const d = decls((css.match(re) || [])[1] || "");
  return { accent: d["--accent"], ink: d["--accent-ink"], weak: d["--accent-weak"], btn: d["--btn-primary"] };
}

describe("workspace brand presets", () => {
  it("lists the default and four presets, and only those ids are valid", () => {
    expect(BRANDS.map((b) => b.id)).toEqual(["violet", "blue", "teal", "green", "slate"]);
    expect(isBrand("blue")).toBe(true);
    for (const bad of ["red", "#ff0000", "", null, undefined, 3, "BLUE", "blue; x"]) expect(isBrand(bad)).toBe(false);
    expect(brandAttr("violet")).toBeNull(); expect(brandAttr("teal")).toBe("teal"); expect(brandAttr("nope")).toBeNull();
  });
  for (const { id } of BRANDS) {
    it(`${id}: text and controls are readable in the light theme`, () => {
      const l = light(id);
      expect(l.b500 && l.b600 && l.b50, "ramp found in the stylesheet").toBeTruthy();
      expect(contrast(WHITE, l.b500), "white on the primary button").toBeGreaterThanOrEqual(4.5);
      expect(contrast(l.b600, WHITE), "accent text on white").toBeGreaterThanOrEqual(4.5);
      expect(contrast(l.b600, l.b50), "accent text on its tint").toBeGreaterThanOrEqual(4.5);
      expect(contrast(l.b600, LIGHT_SUBTLE), "accent text on a subtle panel").toBeGreaterThanOrEqual(4.5);
    });
    it(`${id}: text and controls are readable in the dark theme`, () => {
      const d = dark(id);
      expect(d.accent && d.ink && d.weak, "dark values found in the stylesheet").toBeTruthy();
      expect(contrast(d.ink, d.weak), "accent text on its tint").toBeGreaterThanOrEqual(4.5);
      expect(contrast(d.ink, DARK_SURFACE), "accent text on a card").toBeGreaterThanOrEqual(4.5);
      expect(contrast(d.ink, DARK_BG), "accent text on the page").toBeGreaterThanOrEqual(4.5);
      expect(contrast(DARK_SURFACE, d.accent), "initials on the avatar").toBeGreaterThanOrEqual(4.5);
      expect(contrast(WHITE, d.btn ?? light(id).b500), "white on the primary button").toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("setBrand", () => {
  afterEach(() => { appStore.set({ role: "super" }); TEAM_SETTINGS.brand = DEFAULT_BRAND; });
  it("lets an admin pick a preset and refuses anything else", async () => {
    appStore.set({ role: "admin" });
    await setBrand("teal");
    expect(TEAM_SETTINGS.brand).toBe("teal");
    await expect(setBrand("#ff0000")).rejects.toThrow();
    await expect(setBrand("javascript:alert(1)")).rejects.toThrow();
    expect(TEAM_SETTINGS.brand).toBe("teal");
  });
  it("refuses a role that is not an admin", async () => {
    appStore.set({ role: "auditor" });
    await expect(setBrand("blue")).rejects.toThrow();
    expect(TEAM_SETTINGS.brand).toBe(DEFAULT_BRAND);
  });
});
