/* Production Ask view (programme group 6). The person chooses which records go with a question and sees them before sending; nothing else
   about the company is sent. The server reads those records from its own copy without people fields, runs the PII blocker on everything and
   either blocks (and explains what kind of data, where) or sends to the model. Answers are drafts: copy, mark reviewed. Questions and answers
   are not stored on the server; the thread lives in this browser tab only. */
import { useEffect, useMemo, useState } from "react";
import { AIPanel, Chip, Icon } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { DATA } from "@/lib/data";
import { findPii } from "@/lib/pii";
import { modAllowed } from "@/lib/rbac";
import { useG6Settings } from "@/lib/g6";
import { setModState, useApp, useData, useModState } from "@/lib/store";
import { uiMessage } from "@/lib/grcSod";
import { useMembers } from "@/components/kit/MemberSelect";
import * as svc from "@/features/assistant/services/assistant";

/* eslint-disable @typescript-eslint/no-explicit-any */
const SOURCES: { mod: string; label: string; rows: () => any[] }[] = [
  { mod: "controls", label: "Controls", rows: () => DATA.controls }, { mod: "risk", label: "Risks", rows: () => DATA.risks }, { mod: "issues", label: "Issues", rows: () => DATA.issues },
  { mod: "policies", label: "Policies", rows: () => DATA.policies }, { mod: "evidence", label: "Evidence", rows: () => DATA.evidence }, { mod: "vendors", label: "Vendors", rows: () => DATA.vendors },
  { mod: "questionnaires", label: "Questionnaires", rows: () => DATA.questionnaires }, { mod: "ai", label: "AI systems", rows: () => DATA.ai }, { mod: "audits", label: "Audits", rows: () => DATA.audits },
];
const nameOf = (x: any) => String(x.title || x.name || x.id).slice(0, 80);
const recOf = (mod: string, x: any): svc.AskRecord => ({ mod, id: String(x.id), label: `${x.id} ${nameOf(x)}` });
/** Suggestions fill in the question and the records they need; the person sees both before sending. */
const SUGG: { q: string; pick: () => svc.AskRecord[] }[] = [
  { q: "Summarise open risks", pick: () => DATA.risks.filter((r: any) => r.status !== "Closed").sort((a: any, b: any) => b.rl * b.ri - a.rl * a.ri).map((r: any) => recOf("risk", r)) },
  { q: "Draft a board summary of our highest risks and failing controls", pick: () => [...DATA.risks.filter((r: any) => r.status !== "Closed" && r.rl * r.ri >= 12).map((r: any) => recOf("risk", r)), ...DATA.controls.filter((c: any) => /fail/i.test(c.status)).map((c: any) => recOf("controls", c))] },
  { q: "What is failing, and what should we fix first?", pick: () => DATA.controls.filter((c: any) => /fail/i.test(c.status)).map((c: any) => recOf("controls", c)) },
  { q: "Explain our identity and access controls", pick: () => DATA.controls.filter((c: any) => /identity|access/i.test(String(c.domain))).map((c: any) => recOf("controls", c)) },
  { q: "Draft a policy review update", pick: () => DATA.policies.map((p: any) => recOf("policies", p)) },
];
interface Turn extends svc.Msg { notSent?: boolean; draftId?: string; reviewed?: boolean; records?: string[]; masked?: boolean; model?: string; blocked?: { message: string; findings: { kind: string; where: string }[] } }
/** The thread of the signed-in person in this tab (cleared when someone else signs in here). */
const THREAD: { who: string; turns: Turn[] } = { who: "", turns: [] };

export function AskServer({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  useData(); const role = useApp((s) => s.role); const who = useApp((s) => s.who) || "";
  const L = useLayer(); const members = useMembers();
  const s = useG6Settings();
  const [turns, setTurns] = useState<Turn[]>(() => (THREAD.who === who ? THREAD.turns : []));
  useEffect(() => { THREAD.who = who; THREAD.turns = turns; }, [who, turns]);
  const [text, setText] = useState(""); const [records, setRecords] = useState<svc.AskRecord[]>([]); const [busy, setBusy] = useState(false);
  const [mod, setMod] = useState("risk"); const [pick, setPick] = useState("");
  const [from] = useModState<string>("assistant.from", "");
  const sources = SOURCES.filter((x) => modAllowed(role, "ws", x.mod));
  const src = sources.find((x) => x.mod === mod) ?? sources[0];
  const max = s?.limits.recordsMax ?? 25;
  useEffect(() => { const sc = scrollRef.current; if (sc && turns.length) sc.scrollTop = sc.scrollHeight; }, [turns.length, scrollRef]);
  // the record the person was looking at when they opened the assistant (topbar button or Ctrl J)
  const viewing = useMemo(() => {
    const m = /^\/ws\/([a-z]+)\/([^/]+)/.exec(from); if (!m) return null;
    const so = SOURCES.find((x) => x.mod === m[1]); const x = so?.rows().find((r: any) => String(r.id) === decodeURIComponent(m[2]));
    return so && x && modAllowed(role, "ws", so.mod) ? recOf(so.mod, x) : null;
  }, [from, role]);
  const has = (r: svc.AskRecord) => records.some((x) => x.mod === r.mod && x.id === r.id);
  const add = (list: svc.AskRecord[]) => setRecords((cur) => { const out = [...cur]; for (const r of list) if (out.length < max && !out.some((x) => x.mod === r.mod && x.id === r.id)) out.push(r); return out; });
  const warn = useMemo(() => findPii([{ where: "your question", text }], members.map((m) => m.name)), [text, members]);
  const off = !s?.configured ? "AI is not set up on this deployment yet: the platform operator adds the AI provider's key on the server." : !s.enabled ? "AI is off for your company. A company admin turns it on in Settings, and a second admin approves." : "";

  const ask = async () => {
    const q = text.trim(); if (!q || busy) return;
    setBusy(true);
    try {
      const r = await svc.askServer(q, records, turns.filter((t) => !t.blocked && !t.notSent)); // a blocked question is never sent again as history
      if (r.blocked) setTurns((t) => [...t, { role: "user", text: q, records: records.map((x) => x.label), notSent: true }, { role: "assistant", text: "", blocked: { message: r.message, findings: r.findings } }]);
      else { const g = r as Extract<svc.AskResult, { blocked: false }>; setTurns((t) => [...t, { role: "user", text: q, records: g.records }, { role: "assistant", text: g.text, draft: true, draftId: g.draftId, masked: g.masked, model: g.model }]); setText(""); }
    } catch (e) { L.toast(uiMessage(e) || "Could not draft an answer", false); }
    finally { setBusy(false); }
  };
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); L.toast("Draft copied"); } catch { L.toast("Copy not available in this view"); } };
  const reviewed = async (i: number) => {
    const t = turns[i]; if (!t.draftId) return;
    try { await svc.markReviewed(t.draftId); setTurns((all) => all.map((x, k) => (k === i ? { ...x, reviewed: true } : x))); L.toast("Marked as reviewed"); }
    catch (e) { L.toast(uiMessage(e), false); }
  };
  return (
    <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
      {off ? <div className="card" style={{ boxShadow: "none", background: "var(--warn-bg)", borderColor: "transparent" }}><div className="c-body" style={{ padding: "10px 14px", fontSize: 13, color: "var(--warn-ink)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ flex: "1 1 260px" }}>{off}</span>{s?.configured ? <button className="btn btn-secondary sm" onClick={() => setModState("assistant.view", "settings")}>Open Settings</button> : null}</div></div> : null}
      {turns.length ? turns.map((m, i) => m.role === "user" ? (
        <div key={i} style={{ alignSelf: "flex-end", maxWidth: "85%" }}>
          <div style={{ background: "var(--accent-weak)", color: "var(--ink)", padding: "9px 13px", borderRadius: "13px 13px 3px 13px", fontSize: 13.5, lineHeight: 1.5, overflowWrap: "anywhere" }}>{m.text}</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", textAlign: "right", marginTop: 3 }}>{m.notSent ? "Not sent" : m.records?.length ? `Sent with ${m.records.length} record${m.records.length === 1 ? "" : "s"}: ${m.records.join(", ")}` : "No records sent"}</div>
        </div>
      ) : m.blocked ? (
        <div key={i} role="alert" className="card" style={{ alignSelf: "flex-start", maxWidth: "94%", boxShadow: "none", background: "var(--bad-bg)", borderColor: "transparent" }}>
          <div className="c-body" style={{ padding: "10px 14px", fontSize: 13, color: "var(--bad-ink)" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}><Icon name="alert" /><strong>Blocked by the PII blocker</strong></div>
            <p style={{ margin: "0 0 6px" }}>{m.blocked.message}</p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>{m.blocked.findings.map((f, k) => <li key={k}>{f.where}: {f.kind}</li>)}</ul>
          </div>
        </div>
      ) : (
        <div key={i} style={{ alignSelf: "flex-start", maxWidth: "94%" }}>
          <AIPanel source="Assistant" meta={`Draft, review required${m.model ? ` · ${m.model}` : ""}`} label="Assistant answer"
            footer={<>
              {m.masked ? <Chip cls="warn" icon="alert">Personal data was masked before sending</Chip> : null}
              <button className="btn btn-ghost sm" onClick={() => copy(m.text)}>Copy</button>
              {m.reviewed ? <Chip cls="ok" icon="check">Reviewed</Chip> : <button className="btn btn-ghost sm" onClick={() => reviewed(i)}><Icon name="check" />Mark reviewed</button>}
            </>}>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{m.text}</div>
          </AIPanel>
        </div>
      )) : (
        <AIPanel source="Assistant" meta="Draft, review required" label="Assistant introduction">
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>Ask about the records you choose below: only those are sent, without names of owners or authors. A PII blocker checks every request first{s?.mode === "mask" ? " and masks personal data it finds" : " and stops it if it finds personal data, saying what and where"}. Every answer is a draft for your review. Nothing is used to train AI models.</p>
        </AIPanel>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{SUGG.map((x) => <button key={x.q} className="fchip" onClick={() => { setText(x.q); setRecords([]); add(x.pick()); }}>{x.q}</button>)}</div>

      <div className="card" style={{ boxShadow: "none" }}><div className="c-body" style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 13 }}>Records sent with your question</strong><span className="tag">{records.length} of {max}</span>
          {records.length ? <button className="btn btn-ghost sm" style={{ marginLeft: "auto" }} onClick={() => setRecords([])}>Remove all</button> : null}
        </div>
        {records.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{records.map((r) => (
          <span key={`${r.mod}/${r.id}`} className="tag" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{r.label}<button className="icon-btn" style={{ width: 20, height: 20 }} aria-label={`Remove ${r.label}`} onClick={() => setRecords((cur) => cur.filter((x) => !(x.mod === r.mod && x.id === r.id)))}><Icon name="x" /></button></span>
        ))}</div> : <p className="field help" style={{ margin: 0 }}>None: only your question is sent.</p>}
        {viewing && !has(viewing) ? <div><button className="fchip" onClick={() => add([viewing])}><Icon name="plus" />Add {viewing.label} (the record you were viewing)</button></div> : null}
        {src ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ margin: 0 }}><label htmlFor="ask-mod">Module</label><select className="select" id="ask-mod" value={src.mod} onChange={(e) => { setMod(e.target.value); setPick(""); }}>{sources.map((x) => <option key={x.mod} value={x.mod}>{x.label}</option>)}</select></div>
          <div className="field" style={{ margin: 0, flex: "1 1 220px" }}><label htmlFor="ask-rec">Record</label><select className="select" id="ask-rec" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">{src.rows().length ? "Choose a record" : "No records yet"}</option>{src.rows().map((x: any) => <option key={x.id} value={String(x.id)} disabled={has(recOf(src.mod, x))}>{x.id} {nameOf(x)}</option>)}</select></div>
          <button className="btn btn-secondary sm" disabled={!pick || records.length >= max} onClick={() => { const x = src.rows().find((r: any) => String(r.id) === pick); if (x) add([recOf(src.mod, x)]); setPick(""); }}><Icon name="plus" />Add</button>
        </div> : null}
      </div></div>

      <div className="field" style={{ margin: 0 }}>
        <label className="vh" htmlFor="asstInput">Ask the assistant</label>
        <textarea className="input" id="asstInput" rows={2} maxLength={svc.ASK_MAX} placeholder="Ask about the records you chose, or draft a summary…" style={{ resize: "vertical" }} value={text} onChange={(e) => setText(e.target.value)}
          aria-describedby={warn.length ? "asst-warn" : undefined} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask(); }} />
        {warn.length ? <p className="field help" id="asst-warn" style={{ color: "var(--warn-ink)" }}>Your question seems to contain {[...new Set(warn.map((w) => w.kind))].join(", ")}. {s?.mode === "mask" ? "It will be masked before sending." : "It will be blocked: remove it first."}</p> : null}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn btn-primary" disabled={busy || !!off || !text.trim()} onClick={ask}><Icon name="assistant" />{busy ? "Drafting…" : "Draft answer"}</button>
        {turns.length ? <button className="btn btn-ghost sm" onClick={() => setTurns([])}><Icon name="x" />Clear</button> : null}
        <span className="field help" style={{ margin: "0 0 0 auto" }}>Draft only · human review required · {s?.limits.perHour ?? 30} questions an hour</span>
      </div>
    </div>
  );
}
