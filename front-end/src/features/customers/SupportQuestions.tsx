/* Admin Console: Support questions (reference review R4). Platform staff (super admins and support) read every company's questions to Selvara
   support and answer them; the asker is told in the app, and by email when email is set up. Staff see the question and the company's name,
   nothing else of the company. The server decides who may do this (server/helpdesk.ts, migration 0011). */
import { useEffect, useState } from "react";
import { DataTable, Empty, Icon, StatusChip, type DTColumn } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import * as svc from "@/services/help";

const when = (ms: number) => new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export function SupportQuestions() {
  const L = useLayer();
  const [data, setData] = useState<{ questions: svc.HelpQ[]; mail: boolean } | null>(null); const [err, setErr] = useState(""); const [n, setN] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { let on = true; svc.inbox().then((x) => { if (on) { setData(x); setErr(""); } }, (e) => { if (on) setErr(message(e, "Could not load the questions")); }); return () => { on = false; }; }, [n]);
  const refresh = () => setN((x) => x + 1);
  if (err) return <p className="advisory" role="alert"><Icon name="alert" /><span>{err}</span></p>;
  if (!data) return <p className="cell-sub">Loading…</p>;
  const q = sel ? data.questions.find((x) => x.id === sel) ?? null : null;
  const cols: DTColumn<svc.HelpQ>[] = [
    { key: "ref", header: "Ref", nowrap: true, locked: true, value: (x) => x.ref, render: (x) => <span className="strong num">{x.ref}</span> },
    { key: "subject", header: "Question", value: (x) => x.subject, render: (x) => x.subject, sub: (x) => `${x.company ?? ""} · ${x.asker} · ${svc.topicName(x.topic)}` },
    { key: "updated", header: "Updated", nowrap: true, value: (x) => when(x.updatedAt), sortBy: (x) => x.updatedAt, render: (x) => when(x.updatedAt) },
    { key: "status", header: "Status", value: (x) => x.status, render: (x) => <StatusChip s={x.status} /> },
    { key: "open", header: "Open", hideHeader: true, align: "end", locked: true, render: (x) => <button className="btn btn-ghost sm" aria-label={`Open ${x.ref}`} onClick={() => setSel(x.id)}>Open</button> },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p className="field help" style={{ margin: 0 }}>Questions companies sent to Selvara support from their Help centre. Answer here; the person is told in Selvara{data.mail ? " and by email" : ""}. Never ask for passwords, codes or customer data.{data.mail ? "" : " New questions are not emailed to the support inbox: set SUPPORT_INBOX_EMAIL to turn that on."}</p>
      {data.questions.length ? (
        <DataTable<svc.HelpQ> id="support-questions" label="Support questions" rows={data.questions} rowKey={(x) => x.id} columns={cols} searchText={(x) => `${x.ref} ${x.subject} ${x.company ?? ""} ${x.asker}`}
          tabs={["Open", "Answered", "Closed"].map((s) => ({ key: s, label: s, match: (x: svc.HelpQ) => x.status === s }))} exportName="support-questions" />
      ) : <Empty icon="message" title="No questions yet">Questions that companies ask from the Help centre appear here.</Empty>}
      {q ? <Thread key={q.id} q={q} onDone={refresh} onClose={() => setSel(null)} L={L} /> : null}
    </div>
  );
}

function Thread({ q, onDone, onClose, L }: { q: svc.HelpQ; onDone: () => void; onClose: () => void; L: ReturnType<typeof useLayer> }) {
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const run = async (f: () => Promise<unknown>, done: string) => { setBusy(true); setErr(""); try { await f(); setText(""); L.toast(done); onDone(); } catch (e) { setErr(message(e, "That did not work. Try again.")); } finally { setBusy(false); } };
  return (
    <section className="card" aria-labelledby={`sq-${q.id}`}>
      <div className="c-head"><h3 id={`sq-${q.id}`}>{q.ref}: {q.subject}</h3><StatusChip s={q.status} /><button className="btn btn-ghost sm" style={{ marginLeft: "auto" }} onClick={onClose}><Icon name="x" />Close panel</button></div>
      <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p className="cell-sub" style={{ margin: 0 }}>{q.company} · asked by {q.asker} · {svc.topicName(q.topic)}</p>
        <ol className="help-thread" aria-label={`Messages on ${q.ref}`}>
          {q.messages.map((m, i) => <li key={i} className={m.staff ? "staff" : undefined}><span className="cell-sub"><span className="strong">{m.staff ? `${m.by} · Selvara support` : m.by}</span> · {when(m.at)}</span><p>{m.text}</p></li>)}
        </ol>
        <form onSubmit={(e) => { e.preventDefault(); void run(() => svc.answer(q.id, text), `Answer sent on ${q.ref}`); }} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label htmlFor={`sa-${q.id}`} className="strong">Answer</label>
          <textarea id={`sa-${q.id}`} className="input" rows={4} maxLength={svc.BODY_MAX} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="btngrp">
            <button className="btn btn-primary btn-decide sm" type="submit" disabled={busy || !text.trim()}>Send answer</button>
            {q.status === "Closed" ? <button type="button" className="btn btn-ghost sm" disabled={busy} onClick={() => void run(() => svc.setStatus(q.id, "Open"), `${q.ref} reopened`)}>Reopen</button>
              : <button type="button" className="btn btn-ghost sm" disabled={busy} onClick={() => void run(() => svc.setStatus(q.id, "Closed"), `${q.ref} closed`)}><Icon name="check" />Close question</button>}
          </div>
        </form>
        {err ? <p className="advisory" role="alert"><Icon name="alert" /><span>{err}</span></p> : null}
      </div>
    </section>
  );
}
