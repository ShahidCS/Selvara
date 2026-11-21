import type { ReactNode } from "react";
import { Chip } from "@/components/ui";
import { AI_GUARDRAIL_TONE } from "@/features/ai/lib/ai";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Status is never colour alone: every chip carries an icon chosen from its tone, beside the label. */
const TONE_ICON: Record<string, string> = { ok: "check", warn: "clock", bad: "alert", neutral: "dot", info: "dot" };
const ToneChip = ({ t, children }: { t: string; children: ReactNode }) => <Chip cls={t} icon={TONE_ICON[t] || "dot"}>{children}</Chip>;
export function AiEuChip({ c }: { c?: string }) {
  const v = c || "Not classified";
  const t = (v === "Prohibited" || v === "High-risk") ? "bad" : v === "Limited risk" ? "warn" : v === "Not classified" ? "neutral" : "ok";
  return <ToneChip t={t}>{v}</ToneChip>;
}
export const AiGuardChip = ({ g }: { g?: string }) => <ToneChip t={AI_GUARDRAIL_TONE[g || ""] || "neutral"}>{g || "Controlled"}</ToneChip>;
export function AiFriaChip({ f }: { f?: any }) {
  if (!f) return <Chip cls="neutral">—</Chip>;
  const m: Record<string, string> = { Complete: "ok", "In progress": "warn", "Not started": "bad", "Not required": "neutral" };
  return <ToneChip t={m[f.status] || "neutral"}>{f.status}</ToneChip>;
}
export function AiBiasChip({ b }: { b?: any }) {
  if (!b) return <Chip cls="neutral">—</Chip>;
  const m: Record<string, string> = { Passed: "ok", "Issues found": "bad", Due: "warn", "Not tested": "bad", "Not applicable": "neutral" };
  return <ToneChip t={m[b.status] || "neutral"}>{b.status}</ToneChip>;
}
