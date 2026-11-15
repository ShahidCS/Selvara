/** Tenant brand presets (phase 6). The colours live in `portal.css` as `[data-brand="<id>"]` rules and are contrast-checked in tests;
 *  a workspace can only pick one of these ids, never a free colour. Violet is the product default and sets no attribute. */
export const BRANDS = [
  { id: "violet", label: "Violet", note: "Default" },
  { id: "blue", label: "Blue", note: "" },
  { id: "teal", label: "Teal", note: "" },
  { id: "green", label: "Green", note: "" },
  { id: "slate", label: "Slate", note: "Neutral graphite" },
] as const;
export type BrandId = (typeof BRANDS)[number]["id"];
export const DEFAULT_BRAND: BrandId = "violet";
export const isBrand = (v: unknown): v is BrandId => typeof v === "string" && BRANDS.some((b) => b.id === v);
/** The `data-brand` attribute value for a stored choice (the default sets none, so the stylesheet's base tokens apply). */
export const brandAttr = (v: unknown): BrandId | null => (isBrand(v) && v !== DEFAULT_BRAND ? v : null);
