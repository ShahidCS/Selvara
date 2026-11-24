/* R36: "Ask about this report". A question about the figures on the page, answered from the facts the page computed.
   Production: the Assistant on the server answers (the same checks as AiWording: personal data, AI on, the audit entry; roles that open the
   AI Assistant only). The demonstration has no model: it lists the facts that share words with the question, and says so. Answers are drafts. */
import { useId, useState } from "react";
import { AIPanel, AiMark, Icon } from "@/components/ui";
import { API_ON, modAllowed } from "@/lib/rbac";
import { useApp } from "@/lib/store";
import { wsPost } from "@/services/ws";
import { aiQuestion } from "./AiWording";

const Q_MAX = 500;
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? []);
/** The demonstration's answer: the facts that share a word with the question (all of them when none does). */
export function matchFacts(question: string, facts: string[]): string[] {
  const q = words(question); const hit = facts.filter((f) => [...words(f)].some((w) => q.has(w) || q.has(w.replace(/s$/, ""))));
  return (hit.length ? hit : facts).slice(0, 6);
}

type Answer = { blocked: true; message: string } | { blocked: false; text: string; model: string };
export function AskPanel({ title, facts, suggestions }: { title: string; facts: string[]; suggestions: string[] }) {
  const role = useApp((s) => s.role); const id = useId();
  const [q, setQ] = useState(""); const [asked, setAsked] = useState(""); const [busy, setBusy] = useState(false); const [out, setOut] = useState<Answer | null>(null); const [err, setErr] = useState("");
  if (!modAllowed(role, "ws", "assistant")) return null;
  const ask = async (text: string) => {
    const t = text.trim().slice(0, Q_MAX); if (!t) { setErr("Write a question."); return; }
    setBusy(true); setErr(""); setOut(null); setAsked(t);
    try {
      if (!API_ON) { setOut({ blocked: false, text: matchFacts(t, facts).map((f) => `• ${f}`).join("\n"), model: "facts matched by a template (demonstration, no AI model)" }); return; }
      setOut(await wsPost<Answer>("/ws/assistant/ask", { question: aiQuestion(`Answer this question about the report: ${t}`, facts), records: [], history: [] }));
    } catch (e) { setErr(e instanceof Error && e.message ? e.message : "The AI could not answer. Try again later."); }
    finally { setBusy(false); }
  };
  const good = out && out.blocked === false ? out : null;
  return (
    <section className="card ask-panel" aria-labelledby={`${id}-h`} data-tour="reports-ask">
      <div className="c-head"><h3 id={`${id}-h`} style={{ display: "flex", alignItems: "center", gap: 8 }}><AiMark size={18} />{title}</h3></div>
      <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <form onSubmit={(e) => { e.preventDefault(); void ask(q); }} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label className="vh" htmlFor={`${id}-q`}>Your question</label>
          <input className="input" id={`${id}-q`} style={{ flex: "1 1 260px" }} maxLength={Q_MAX} value={q} onChange={(e) => setQ(e.target.value)} placeholder="For example: which framework is furthest behind?" />
          <button className="btn btn-secondary" type="submit" disabled={busy} aria-busy={busy || undefined}>{busy ? "Answering…" : "Ask"}</button>
        </form>
        <div className="btngrp" aria-label="Suggested questions" role="group">
          {suggestions.map((s) => <button key={s} type="button" className="fchip" disabled={busy} onClick={() => { setQ(s); void ask(s); }}>{s}</button>)}
        </div>
        {good ? (
          <AIPanel source={`Question: ${asked}`} meta={good.model} label="Answer: draft">
            <p className="ai-wording-text">{good.text}</p>
          </AIPanel>
        ) : null}
        {out && out.blocked === true ? <p className="advisory" role="alert"><Icon name="alert" /><span>{out.message}</span></p> : null}
        {err ? <p className="advisory" role="alert"><Icon name="alert" /><span>{err}</span></p> : null}
        <p className="cell-sub" style={{ margin: 0 }}>Answers use only the figures on this page{API_ON ? "; nothing is sent when AI is off for your company" : ""}.</p>
      </div>
    </section>
  );
}
