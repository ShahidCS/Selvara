import type { CSSProperties } from "react";
import { RBand, bandTint, bandText, rband } from "@/lib/risk";

const tone = (b: RBand): CSSProperties => ({ background: bandTint(b.col, 15), color: bandText(b.col), border: `1px solid ${bandTint(b.col, 30)}` });
const TAB: CSSProperties = { fontVariantNumeric: "tabular-nums" };
/** Colour is never the only signal: the chip always carries the band name and the number. */
export function ScoreChip({ score, label }: { score: number; label?: string }) {
  const b = rband(score);
  return <span className="chip" style={{ ...tone(b), ...TAB, whiteSpace: "nowrap" }}>{label ? label + " " : ""}{score} <span style={{ fontWeight: 500 }}>{b.name}</span></span>;
}
export function RatingPill({ b }: { b: RBand }) { return <span className="chip" style={tone(b)}>{b.name}</span>; }
export function BandPill({ score, label }: { score: number; label?: string }) {
  const b = rband(score);
  return <span className="chip" style={{ ...tone(b), ...TAB }}>{label ? label + " " : ""}{b.name} {score}</span>;
}
/** Required-field marker, the same red asterisk the other forms use. */
export const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;
