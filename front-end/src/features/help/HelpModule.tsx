/* The Help centre (reference review R4): a searchable knowledge base, "Ask Selvara support", and the person's own questions with the answers.
   For everyone signed in, like Your account: /help, /help/<article>, /help/ask and /help/questions. Platform staff read the guides; they
   answer questions in the Admin Console (Customers, Support questions), not here. */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Empty, FormActions, FormMessage, FormSection, Icon, Page, StatusChip } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { HELP_ARTICLES, articleById, searchArticles, type HelpArticle } from "@/data/helpArticles";
import { roleOf } from "@/lib/rbac";
import { useGo, useRoute } from "@/lib/route";
import { useApp } from "@/lib/store";
import * as svc from "@/services/help";

const HOME = { href: "/help", label: "Help centre" };
const when = (ms: number) => new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const useStaff = () => roleOf(useApp((s) => s.role)).spaces.includes("admin");
const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export default function HelpModule() {
  const { param } = useRoute();
  if (param === "ask") return <AskPage />;
  if (param === "questions") return <MyQuestions />;
  if (param) { const a = articleById(param); return a ? <ArticlePage a={a} /> : <Page title="Article not found" back={HOME}><Empty icon="search" title="No such article">The link may be old. Search the Help centre instead.</Empty></Page>; }
  return <HelpHome />;
}

function ArticleList({ list }: { list: HelpArticle[] }) {
  return (
    <ul className="help-list">
      {list.map((a) => (
        <li key={a.id}><Link href={`/help/${a.id}`}><span className="strong">{a.title}</span><span className="cell-sub">{a.summary}</span></Link></li>
      ))}
    </ul>
  );
}

function HelpHome() {
  const go = useGo(); const staff = useStaff();
  const [q, setQ] = useState("");
  const hits = useMemo(() => searchArticles(q), [q]);
  return (
    <Page mod="help" acts={staff ? undefined : <><button className="btn btn-secondary" onClick={() => go("/help/questions")}><Icon name="message" />My questions</button><button className="btn btn-primary" onClick={() => go("/help/ask")}><Icon name="plus" />Ask a question</button></>}>
      <div className="scroll" style={{ overflow: "auto" }}>
        <div className="help-search" role="search">
          <label htmlFor="help-q" className="vh">Search the Help centre</label>
          <Icon name="search" />
          <input id="help-q" className="input" type="search" maxLength={100} placeholder="Search guides, for example “accept a risk” or “pause agents”" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {q.trim() ? (
          <section className="card" aria-labelledby="help-res-h" style={{ marginTop: 14 }}>
            <div className="c-head"><h2 id="help-res-h" className="cal-h">{hits.length ? `${hits.length} guide${hits.length === 1 ? "" : "s"} found` : "No guide matches"}</h2></div>
            <div className="c-body" aria-live="polite">
              {hits.length ? <ArticleList list={hits} /> : <p className="cell-sub" style={{ margin: 0 }}>Try other words{staff ? "." : <>, or <Link href={`/help/ask?subject=${encodeURIComponent(q.trim().slice(0, 160))}`}>ask Selvara support</Link>.</>}</p>}
            </div>
          </section>
        ) : (
          <div className="help-topics">
            {svc.HELP_TOPICS.filter(([k]) => HELP_ARTICLES.some((a) => a.topic === k)).map(([k, name]) => (
              <section key={k} className="card" aria-labelledby={`ht-${k}`}>
                <div className="c-head"><h2 id={`ht-${k}`} className="cal-h">{name}</h2></div>
                <div className="c-body"><ArticleList list={HELP_ARTICLES.filter((a) => a.topic === k)} /></div>
              </section>
            ))}
          </div>
        )}
        {staff ? <p className="cell-sub" style={{ marginTop: 14 }}>Questions from companies are answered in the Admin Console, under Customers, Support questions.</p> : (
          <section className="panel-soft help-ask-cta" aria-labelledby="help-cta-h" style={{ marginTop: 14 }}>
            <div><h2 id="help-cta-h" className="cal-h">Can&apos;t find what you need?</h2><p className="cell-sub" style={{ margin: "2px 0 0" }}>Ask Selvara support. Only support staff see your question; the answer appears under My questions.</p></div>
            <button className="btn btn-decide" onClick={() => go("/help/ask")}>Ask a question</button>
          </section>
        )}
      </div>
    </Page>
  );
}

function ArticlePage({ a }: { a: HelpArticle }) {
  const go = useGo(); const staff = useStaff();
  const related = HELP_ARTICLES.filter((x) => x.topic === a.topic && x.id !== a.id).slice(0, 3);
  return (
    <Page title={a.title} sub={a.summary} back={HOME} eyebrow={svc.topicName(a.topic)}>
      <div className="scroll" style={{ overflow: "auto" }}>
        <div className="help-article-grid">
          <article className="card help-article"><div className="c-body">
            {a.body.map((b, i) => (Array.isArray(b) ? <ul key={i}>{b.map((li) => <li key={li}>{li}</li>)}</ul> : <p key={i}>{b}</p>))}
            {a.open && !(staff && a.open.href.startsWith("/ws/")) ? <p><button className="btn btn-secondary" onClick={() => go(a.open!.href)}>{a.open.label}<Icon name="chevron" /></button></p> : null}
          </div></article>
          <aside className="rec-side">
            {related.length ? <div className="card"><div className="c-head"><h3>Related guides</h3></div><div className="c-body"><ArticleList list={related} /></div></div> : null}
            {staff ? null : <div className="panel-soft"><span className="strong">Still stuck?</span><span className="cell-sub">Ask Selvara support and get an answer under My questions.</span><button className="btn btn-secondary sm" style={{ alignSelf: "flex-start" }} onClick={() => go(`/help/ask?topic=${a.topic}`)}>Ask a question</button></div>}
          </aside>
        </div>
      </div>
    </Page>
  );
}

function AskPage() {
  const go = useGo(); const L = useLayer(); const staff = useStaff();
  const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const [topic, setTopic] = useState(() => (svc.HELP_TOPICS.some((t) => t[0] === params.get("topic")) ? params.get("topic")! : ""));
  const [subject, setSubject] = useState(() => (params.get("subject") ?? "").slice(0, svc.SUBJECT_MAX)); const [body, setBody] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const dirty = !busy && (subject.trim() !== "" || body.trim() !== "");
  const { allowLeave } = useUnsavedGuard(dirty, L);
  const ref = useRef<HTMLSelectElement>(null); useEffect(() => { ref.current?.focus(); }, []);
  // suggest guides while typing the subject, before the person sends anything
  const hints = useMemo(() => searchArticles(subject, HELP_ARTICLES, "any").slice(0, 3), [subject]);
  if (staff) return <Page title="Ask a question" back={HOME}><Empty icon="message" title="Questions come from company workspaces">Platform staff answer them in the Admin Console, under Customers, Support questions.</Empty></Page>;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const open = (await svc.myQuestions().catch(() => [])).filter((x) => x.status !== "Closed").length;
    const why = svc.askBlock(subject, body, topic, open); if (why) { setErr(why); return; }
    setBusy(true); setErr("");
    try { const q = await svc.ask(subject, body, topic); allowLeave(); L.toast(`Question ${q.ref} sent to Selvara support`); go(`/help/questions?q=${encodeURIComponent(q.id)}`); }
    catch (x) { setBusy(false); setErr(message(x, "The question could not be sent. Try again.")); }
  };
  return (
    <Page title="Ask a question" sub="Selvara support answers in the Help centre, under My questions." back={HOME}>
      <div className="scroll rec-scroll"><form className="rec-form" onSubmit={submit} noValidate>
        <FormSection n={1} title="Your question" note="Only Selvara support staff see it, not your colleagues.">
          <div className="field"><label htmlFor="hq-topic">Topic <span style={{ color: "var(--bad-ink)" }}>*</span></label>
            <select ref={ref} className="select" id="hq-topic" value={topic} onChange={(e) => setTopic(e.target.value)}><option value="">Choose a topic</option>{svc.HELP_TOPICS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
          <div className="field"><label htmlFor="hq-subject">Subject <span style={{ color: "var(--bad-ink)" }}>*</span></label>
            <input className="input" id="hq-subject" maxLength={svc.SUBJECT_MAX} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. How do I map one control to two frameworks?" aria-describedby="hq-hints" /></div>
          <div id="hq-hints" aria-live="polite">{hints.length ? <div className="help-hints"><span className="cell-sub">These guides may answer it:</span><ArticleList list={hints} /></div> : null}</div>
          <div className="field"><label htmlFor="hq-body">Details <span style={{ color: "var(--bad-ink)" }}>*</span></label>
            <textarea className="input" id="hq-body" rows={6} maxLength={svc.BODY_MAX} style={{ resize: "vertical" }} value={body} onChange={(e) => setBody(e.target.value)} aria-describedby="hq-note" />
            <p className="field help" id="hq-note">Say what you were doing and what you expected. Never include passwords, codes, personal data or customer data. {body.length}/{svc.BODY_MAX}</p></div>
        </FormSection>
        {err ? <FormMessage id="hq-err">{err}</FormMessage> : null}
        <FormActions><button type="button" className="btn btn-secondary" onClick={() => go("/help")}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>Send question</button></FormActions>
      </form></div>
    </Page>
  );
}

function MyQuestions() {
  const go = useGo(); const L = useLayer(); const staff = useStaff();
  const [list, setList] = useState<svc.HelpQ[] | null>(null); const [err, setErr] = useState(""); const [n, setN] = useState(0);
  const focus = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("q");
  useEffect(() => { let on = true; if (staff) return; svc.myQuestions().then((x) => { if (on) { setList(x); setErr(""); } }, (e) => { if (on) setErr(message(e, "Could not load your questions")); }); return () => { on = false; }; }, [n, staff]);
  if (staff) return <Page title="My questions" back={HOME}><Empty icon="message" title="Questions come from company workspaces">Platform staff answer them in the Admin Console, under Customers, Support questions.</Empty></Page>;
  const refresh = () => setN((x) => x + 1);
  return (
    <Page title="My questions" sub="Your questions to Selvara support and the answers. Only you and support staff see them." back={HOME} acts={<button className="btn btn-primary" onClick={() => go("/help/ask")}><Icon name="plus" />Ask a question</button>}>
      <div className="scroll" style={{ overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        {err ? <p className="advisory" role="alert"><Icon name="alert" /><span>{err}</span></p> : null}
        {!list ? (err ? null : <p className="cell-sub">Loading…</p>) : !list.length ? <Empty icon="message" title="No questions yet">When you ask Selvara support a question, it appears here with the answer.</Empty>
          : list.map((q) => <QuestionCard key={q.id} q={q} open={q.id === focus || list.length === 1} onChange={refresh} L={L} />)}
      </div>
    </Page>
  );
}

function QuestionCard({ q, open, onChange, L }: { q: svc.HelpQ; open: boolean; onChange: () => void; L: ReturnType<typeof useLayer> }) {
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const run = async (f: () => Promise<unknown>, done: string) => { setBusy(true); setErr(""); try { await f(); setText(""); L.toast(done); onChange(); } catch (e) { setErr(message(e, "That did not work. Try again.")); } finally { setBusy(false); } };
  return (
    <details className="card help-q" open={open}>
      <summary className="c-head"><span className="help-q-h"><span className="strong">{q.subject}</span><span className="cell-sub">{q.ref} · {svc.topicName(q.topic)} · updated {when(q.updatedAt)}</span></span><StatusChip s={q.status === "Answered" ? "Answered" : q.status} /></summary>
      <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <ol className="help-thread" aria-label={`Messages on ${q.ref}`}>
          {q.messages.map((m, i) => <li key={i} className={m.staff ? "staff" : undefined}><span className="cell-sub"><span className="strong">{m.staff ? `${m.by} · Selvara support` : m.by}</span> · {when(m.at)}</span><p>{m.text}</p></li>)}
        </ol>
        {q.status !== "Closed" ? (
          <form onSubmit={(e) => { e.preventDefault(); void run(() => svc.followUp(q.id, text), "Reply sent"); }} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label className="vh" htmlFor={`hf-${q.id}`}>Reply to {q.ref}</label>
            <textarea id={`hf-${q.id}`} className="input" rows={2} maxLength={svc.BODY_MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a reply" />
            <div className="btngrp"><button className="btn btn-secondary sm" type="submit" disabled={busy || !text.trim()}>Send reply</button>
              <button className="btn btn-ghost sm" type="button" disabled={busy} onClick={() => void run(() => svc.closeMine(q.id), `${q.ref} closed`)}><Icon name="check" />Close question</button></div>
          </form>
        ) : <p className="cell-sub" style={{ margin: 0 }}>Closed. Ask a new question if you need more help.</p>}
        {err ? <p className="advisory" role="alert"><Icon name="alert" /><span>{err}</span></p> : null}
      </div>
    </details>
  );
}
