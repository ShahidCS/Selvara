/* People, vendors, severity and AI marks for lists, cards and timelines (reference review R14, R17, R40).
   Avatars are generated initials (no photos are stored). A vendor shows its uploaded logo when one exists, else a letter tile.
   Severity is always the word plus bars, so meaning never rests on colour or bar count alone. */
import type { CSSProperties } from "react";

const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
/** "Owen Hart" or "O. Hart" -> "OH"; "Priya" -> "PR"; empty -> "?". */
export function initialsOf(name: string): string {
  const parts = (name || "").replace(/[^\p{L}\s.'-]/gu, " ").split(/[\s.]+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
/** Six tone classes, all token colours with white text at 4.5:1 or better. */
export const toneOf = (name: string) => `tone-${hash(name || "?") % 6}`;

/** A person's initials in a circle. Decorative next to their name; pass `label` when it stands alone. */
export function Avatar({ name, size = 28, label }: { name: string; size?: number; label?: string }) {
  return (
    // the initials are drawn by CSS from data-i, so a cell's text (and what tests, search and copy see) stays the person's name
    <span className={`avatar-i ${toneOf(name)}`} data-i={initialsOf(name)} style={{ "--s": `${size}px` } as CSSProperties} aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label} />
  );
}
/** Avatar plus name, with an optional second line (role, team). */
export function Person({ name, sub, size = 28 }: { name: string; sub?: string; size?: number }) {
  if (!name || name === "—") return <span className="muted">—</span>;
  return (
    <span className="person"><Avatar name={name} size={size} /><span className="person-t"><span>{name}</span>{sub ? <span className="cell-sub">{sub}</span> : null}</span></span>
  );
}
/** A vendor's logo, or a rounded letter tile until a logo is uploaded. */
export function VendorTile({ name, logo, size = 28 }: { name: string; logo?: string | null; size?: number }) {
  const st = { "--s": `${size}px` } as CSSProperties;
  if (logo) return <span className="vendor-tile img" style={{ ...st, backgroundImage: `url("${encodeURI(logo)}")` }} aria-hidden="true" />;
  const letter = (name || "?").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 1).toUpperCase() || "?";
  return <span className={`vendor-tile ${toneOf(name)}`} data-i={letter} style={st} aria-hidden="true" />;
}

const LEVEL: Record<string, number> = { Critical: 4, Extreme: 4, High: 3, Medium: 2, Low: 1, "Very high": 4, "Very low": 1 };
/** R17: severity or rating as signal bars and the word. Unknown values show the word only. */
export function SeverityBars({ level }: { level: string }) {
  const n = LEVEL[level] ?? 0;
  const tone = n >= 3 ? "bad" : n === 2 ? "warn" : "low";
  return (
    <span className={`sev-bars ${tone}`}>
      {n ? <span className="sev-b" aria-hidden="true">{[1, 2, 3, 4].map((i) => <span key={i} className={i <= n ? "on" : ""} style={{ height: 4 + i * 3 }} />)}</span> : null}
      <span className="sev-w">{level}</span>
    </span>
  );
}
/** R40: the one mark used wherever AI content or an AI action appears. Decorative: the text next to it says what it is. */
export function AiMark({ size = 20 }: { size?: number }) {
  return <span className="ai-mark" aria-hidden="true" style={{ "--s": `${size}px` } as CSSProperties} />;
}
