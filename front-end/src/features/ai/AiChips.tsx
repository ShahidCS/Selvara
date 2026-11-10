import { Chip } from "@/components/ui";
import { AI_GUARDRAIL_TONE } from "@/features/ai/lib/ai";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function AiEuChip({ c }: { c?: string }) {
  const v = c || "Not classified";
  const t = (v === "Prohibited" || v === "High-risk") ? "bad" : v === "Limited risk" ? "warn" : v === "Not classified" ? "neutral" : "ok";
  return <Chip cls={t}>{v}</Chip>;
}
export const AiGuardChip = ({ g }: { g?: string }) => <Chip cls={AI_GUARDRAIL_TONE[g || ""] || "neutral"}>{g || "Controlled"}</Chip>;
export function AiFriaChip({ f }: { f?: any }) {
  if (!f) return <Chip cls="neutral">—</Chip>;
  const m: Record<string, string> = { Complete: "ok", "In progress": "warn", "Not started": "bad", "Not required": "neutral" };
  return <Chip cls={m[f.status] || "neutral"}>{f.status}</Chip>;
}
export function AiBiasChip({ b }: { b?: any }) {
  if (!b) return <Chip cls="neutral">—</Chip>;
  const m: Record<string, string> = { Passed: "ok", "Issues found": "bad", Due: "warn", "Not tested": "bad", "Not applicable": "neutral" };
  return <Chip cls={m[b.status] || "neutral"}>{b.status}</Chip>;
}
