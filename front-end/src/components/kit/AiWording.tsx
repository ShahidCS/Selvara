/* "Write with AI" on request (reference review R9, R22, R36). The facts are computed first (lib/insights.ts); this asks for wording only.
   Production: the question goes through the Assistant on the server (POST /ws/assistant/ask), which checks for personal data before anything
   leaves, refuses when AI is off for the company, and writes the audit entry. Only roles that open the AI Assistant can ask (the server checks).
   The demonstration has no model: it words the same facts with a template and says so. Either way the result is a draft for review. */
import { useState } from "react";
import { AIPanel, AiMark, Icon } from "@/components/ui";
import { API_ON, modAllowed } from "@/lib/rbac";
import { useApp } from "@/lib/store";
import { wsPost } from "@/services/ws";

export interface AiRecordRef { mod: string; id: string }
type Answer = { blocked: true; message: string } | { blocked: false; text: string; model: string; records: string[] };
const MAX_Q = 2000;

/** The question sent: the instruction, then the computed facts as a list (trimmed to the server's question limit). */
export function aiQuestion(ask: string, facts: string[]): string {
  const q = `${ask}\n\nFacts computed by Selvara from the records (use only these):\n${facts.map((f) => `- ${f}`).join("\n")}`;
  return q.length > MAX_Q ? `${q.slice(0, MAX_Q - 1)}…` : q;
}
/** The demonstration's wording: the facts as short prose, clearly not from a model. */
export function templateWording(facts: string[]): string {
  if (!facts.length) return "There is nothing to summarise.";
  return facts.map((f) => (/[.!?]$/.test(f) ? f : `${f}.`)).join(" ");
}

export function AiWording({ ask, facts, records = [], label = "Write with AI", source }: { ask: string; facts: string[]; records?: AiRecordRef[]; label?: string; source: string }) {
  const role = useApp((s) => s.role);
  const [busy, setBusy] = useState(false); const [out, setOut] = useState<Answer | null>(null); const [err, setErr] = useState("");
  // only roles that can open the AI Assistant can ask (in production the server refuses others too)
  if (!modAllowed(role, "ws", "assistant")) return null;
  const run = async () => {
    setBusy(true); setErr("");
    try {
      if (!API_ON) { setOut({ blocked: false, text: templateWording(facts), model: "template (demonstration, no AI model)", records: [] }); return; }
      const r = await wsPost<Answer>("/ws/assistant/ask", { question: aiQuestion(ask, facts), records, history: [] });
      setOut(r);
    } catch (e) { setErr(e instanceof Error && e.message ? e.message : "The AI could not answer. Try again later."); }
    finally { setBusy(false); }
  };
  const good = out && out.blocked === false ? out : null;
  return (
    <div className="ai-wording">
      {good ? (
        <AIPanel source={source} meta={good.model} label={`${label}: draft`} footer={<button className="btn btn-ghost sm" onClick={() => setOut(null)}><Icon name="x" />Discard draft</button>}>
          <p className="ai-wording-text">{good.text}</p>
          {good.records.length ? <p className="cell-sub" style={{ margin: 0 }}>Records sent: {good.records.join(", ")}</p> : null}
        </AIPanel>
      ) : (
        <button className="btn btn-ghost sm" disabled={busy} aria-busy={busy || undefined} onClick={run}><AiMark size={16} />{busy ? "Writing…" : label}</button>
      )}
      {out && out.blocked === true ? <p className="advisory" role="alert"><Icon name="alert" /><span>{out.message}</span></p> : null}
      {err ? <p className="advisory" role="alert"><Icon name="alert" /><span>{err}</span></p> : null}
    </div>
  );
}
