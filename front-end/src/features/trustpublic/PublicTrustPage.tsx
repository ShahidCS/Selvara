import { useCallback, useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Chip, Icon, StatusChip, Empty } from "@/components/ui";
import { ApiError, apiFetch, API_MODE } from "@/services/http";
import { NDA_DOCS, ndaCountText } from "@/lib/trustSections";

/* The public Trust Center for visitors without an account (production programme group 8b; server/trustpublic.ts). Anyone sees what the
   company publishes and opens public documents; to request the others, accept the NDA or subscribe, a visitor confirms a work email with a
   code sent to it. The server decides everything; this page shows it. Security fix F1-02: a section the company does not publish is not in
   the answer at all, and documents under NDA come only as a count until they are shared with the visitor. */
interface Doc { id: string; name: string; access: string; file: boolean; open: boolean }
interface View {
  company: string; ref: string; chatbot: boolean; mail: boolean; faq?: { q: string; a: string }[]; subprocessors?: { name: string; purpose: string }[]; updates?: { at: string; title: string }[];
  controls?: [string, string][]; documents?: Doc[]; ndaCount?: number;
  visitor: { email: string; account: { company: string; nda: string; access: string[] } | null; requests: { resource: string; status: string; at: string }[]; subscribed: boolean } | null;
}
const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
const msg = (e: unknown, f = "Something went wrong. Please try again.") => (e instanceof ApiError && e.status > 0 && e.status < 500 ? e.message : f);

export default function PublicTrustPage({ code }: { code: string }) {
  const [v, setV] = useState<View | null>(null); const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const base = `/trust-public/${encodeURIComponent(code)}`;
  const reload = useCallback(() => apiFetch<View>(base).then((x) => { setV(x); setState("ok"); }, () => setState("missing")), [base]);
  useEffect(() => {
    if (API_MODE !== "http") return;
    let on = true;
    apiFetch<View>(base).then((x) => { if (on) { setV(x); setState("ok"); } }, () => { if (on) setState("missing"); });
    // one-click unsubscribe from an update email (the token is in the address fragment, never sent to a server log)
    const tok = /(?:^|[#&])unsubscribe=([A-Za-z0-9_-]{20,64})/.exec(window.location.hash)?.[1];
    if (tok) { window.history.replaceState(null, "", window.location.pathname); post(`${base}/unsubscribe`, { token: tok }).then(() => { if (on) setNote({ text: "You are unsubscribed from Trust Center updates.", ok: true }); }, (e) => { if (on) setNote({ text: msg(e), ok: false }); }); }
    return () => { on = false; };
  }, [base]);
  const say = (text: string, ok = true) => setNote({ text, ok });
  const act = async (fn: () => Promise<unknown>, done: string) => { try { await fn(); say(done); await reload(); } catch (e) { say(msg(e), false); } };
  const open = async (d: Doc) => { try { const r = await apiFetch<{ url: string }>(`${base}/documents/${encodeURIComponent(d.id)}/link`); window.open(r.url, "_blank", "noopener"); } catch (e) { say(msg(e), false); } };
  if (API_MODE !== "http") return <Shell title="Trust Center"><Card title="Public Trust Center"><p style={{ margin: 0 }}>This page is part of the production build. In this demonstration, preview the public page from Trust Center in the workspace.</p><p style={{ margin: 0, display: "flex", gap: 8, flexWrap: "wrap" }}><Link className="btn btn-primary sm" href="/ws/trust">Open Trust Center in the workspace</Link><Link className="btn btn-secondary sm" href="/login">Sign in</Link></p></Card></Shell>;
  if (state === "loading") return <Shell title="Trust Center"><p style={{ color: "var(--muted)" }}>Loading…</p></Shell>;
  if (state === "missing" || !v) return <Shell title="Trust Center"><Card title="This Trust Center is not public">Check the address, or ask your contact at the company for their Trust Center link.</Card></Shell>;
  const asked = !!v.visitor?.requests.some((r) => r.resource === NDA_DOCS && r.status === "Pending");
  const sendRequest = async (reason: string) => { try { const r = await post<{ queued: boolean; why?: string }>(`${base}/requests`, { reason }); say(r.queued ? "Request sent. You get an email when it is decided." : r.why ?? "Your request was not queued.", r.queued); await reload(); } catch (e) { say(msg(e), false); } };
  return (
    <Shell title={`${v.company} Trust Center`} right={v.visitor ? <span style={{ fontSize: ".8125rem", color: "var(--muted)" }}>Verified as {v.visitor.email} <button className="btn btn-ghost sm" onClick={() => act(() => post(`${base}/sign-out`, {}), "Signed out.")}>Sign out</button></span> : null}>
      {note ? <div className={`banner ${note.ok ? "info" : "warn"}`} role="status" style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon name={note.ok ? "check" : "alert"} /><span style={{ flex: 1 }}>{note.text}</span><button className="btn btn-ghost sm" aria-label="Dismiss" onClick={() => setNote(null)}><Icon name="x" /></button></div> : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {v.documents ? <Card title="Documents">
            {v.documents.map((d) => (
              <div key={d.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--line)", flexWrap: "wrap" }}>
                <span style={{ flex: "1 1 200px" }} className="strong">{d.name}</span>
                {d.access === "Public" ? <Chip cls="ok" icon="check">Public</Chip> : <Chip cls="neutral" icon="access">Shared with you, NDA</Chip>}
                {d.open && d.file ? <button className="btn btn-ghost sm" aria-label={`Open ${d.name}`} onClick={() => open(d)}><Icon name="ext" />Open</button>
                  : !d.file ? <span className="field help" style={{ margin: 0 }}>No file yet</span> : <span className="field help" style={{ margin: 0 }}>Accept the NDA to open it</span>}
              </div>
            ))}
            {v.ndaCount ? (
              <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--line)", flexWrap: "wrap" }} data-testid="trust-nda-count">
                <span style={{ flex: "1 1 200px" }} className="strong"><Icon name="access" /> {ndaCountText(v.ndaCount)}</span>
                <Chip cls="neutral" icon="access">On request, NDA</Chip>
                {asked ? <Chip cls="warn" icon="clock">Requested</Chip> : v.visitor ? <RequestButton onSend={sendRequest} /> : <span className="field help" style={{ margin: 0 }}>Confirm your email to request them</span>}
              </div>
            ) : null}
            {!v.documents.length && !v.ndaCount ? <Empty compact icon="evidence" title="No documents are published yet" /> : null}
          </Card> : null}
          {v.controls?.length ? <Card title="Control status">{v.controls.map(([k, s]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--line)" }}><span>{k}</span><StatusChip s={s} /></div>)}</Card> : null}
          {v.subprocessors?.length ? <Card title="Sub-processors">{v.subprocessors.map((s) => <div key={s.name} style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}><span className="strong">{s.name}</span> <span style={{ color: "var(--muted)" }}>· {s.purpose}</span></div>)}</Card> : null}
          {v.updates?.length ? <Card title="Updates">{v.updates.map((u) => <div key={u.at + u.title} style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}><span className="num" style={{ color: "var(--muted)" }}>{u.at}</span> {u.title}</div>)}</Card> : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {v.visitor ? (
            <Card title="Your access">
              {v.visitor.account ? <>
                <p style={{ margin: 0 }}>Shared with you: {v.visitor.account.access.join(", ") || "no documents yet"}.</p>
                {v.visitor.account.nda === "Accepted" ? <p style={{ margin: 0, display: "flex", gap: 6, alignItems: "center" }}><Icon name="check" />You accepted the NDA.</p>
                  : <div><p style={{ margin: "0 0 8px" }}>Accept the NDA to open the documents shared with you. Your acceptance is yours only: each colleague accepts it for themselves.</p><button className="btn btn-primary sm" onClick={() => act(() => post(`${base}/nda`, {}), "NDA accepted.")}>Accept the NDA</button></div>}
              </> : <p style={{ margin: 0, color: "var(--ink-2)" }}>Request documents under NDA; when the request is approved, you see their names, accept the NDA here and open them.</p>}
              {v.visitor.requests.length ? <p className="field help" style={{ margin: 0 }}>Your requests: {v.visitor.requests.map((r) => `${r.resource} (${r.status})`).join("; ")}</p> : null}
              {v.visitor.subscribed ? <p className="field help" style={{ margin: 0 }}>You get an email when a document is published.</p>
                : <button className="btn btn-secondary sm" style={{ alignSelf: "flex-start" }} onClick={() => act(() => post(`${base}/subscribe`, {}), "Subscribed. Each email has an unsubscribe link.")}><Icon name="bell" />Subscribe to updates</button>}
            </Card>
          ) : <Verify base={base} mail={v.mail} onDone={async () => { say("Email confirmed."); await reload(); }} onError={(t) => say(t, false)} />}
          {v.faq?.length ? <Card title="Frequently asked">{v.faq.map((f) => <details key={f.q} style={{ borderTop: "1px solid var(--line)", padding: "6px 0" }}><summary className="strong" style={{ cursor: "pointer" }}>{f.q}</summary><p style={{ margin: "6px 0 0", color: "var(--ink-2)" }}>{f.a}</p></details>)}</Card> : null}
          {v.chatbot ? <Ask base={base} /> : null}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100%", background: "var(--bg)", color: "var(--ink)" }}>
      <Head><title>{title}</title></Head>
      <header style={{ background: "var(--surface)", borderBottom: "1px solid var(--line)", padding: "14px 24px", display: "flex", gap: 12, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 8, background: "var(--accent)", color: "var(--text-inverse)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="shieldcheck" /></div><h1 style={{ fontSize: "1.125rem", margin: 0 }}>{title}</h1></div>
        {right}
      </header>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 48px", display: "flex", flexDirection: "column", gap: 16 }}>{children}</main>
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card" style={{ padding: "16px 20px", gap: 8 }} aria-label={title}><h2 style={{ fontSize: ".9375rem", margin: 0 }}>{title}</h2>{children}</section>;
}
/** A request for documents under NDA names none (their names are not shown before they are shared); a reason is required. */
function RequestButton({ onSend }: { onSend: (reason: string) => Promise<void> }) {
  const [open, setOpen] = useState(false); const [reason, setReason] = useState(""); const [err, setErr] = useState(false);
  if (!open) return <button className="btn btn-ghost sm" aria-label="Request documents under NDA" onClick={() => setOpen(true)}>Request</button>;
  return (
    <form style={{ display: "flex", gap: 6, flexBasis: "100%", flexWrap: "wrap" }} onSubmit={async (e) => { e.preventDefault(); if (reason.trim().length < 10) { setErr(true); return; } await onSend(reason); setOpen(false); }}>
      <label className="vh" htmlFor="rq-nda">Why you need the documents under NDA</label>
      <input className="input" id="rq-nda" maxLength={300} required placeholder="Why you need them (required)" value={reason} onChange={(e) => { setReason(e.target.value); setErr(false); }} aria-invalid={err} aria-describedby={err ? "rq-nda-err" : undefined} style={{ flex: "1 1 220px" }} />
      <button type="submit" className="btn btn-primary sm">Send request</button><button type="button" className="btn btn-ghost sm" onClick={() => setOpen(false)}>Cancel</button>
      {err ? <p id="rq-nda-err" role="alert" style={{ margin: 0, flexBasis: "100%", color: "var(--bad-ink)" }}>Give a reason of at least 10 characters.</p> : null}
    </form>
  );
}
function Verify({ base, mail, onDone, onError }: { base: string; mail: boolean; onDone: () => Promise<void>; onError: (t: string) => void }) {
  const [email, setEmail] = useState(""); const [code, setCode] = useState(""); const [to, setTo] = useState(""); const [busy, setBusy] = useState(false);
  if (!mail) return <Card title="Request access">This Trust Center cannot verify email addresses yet, so documents on request cannot be asked for here. Ask your contact at the company.</Card>;
  const send = async (e: React.FormEvent) => { e.preventDefault(); if (busy) return; setBusy(true); try { const r = await post<{ to: string }>(`${base}/code`, { email }); setTo(r.to); } catch (x) { onError(msg(x)); } setBusy(false); };
  const check = async (e: React.FormEvent) => { e.preventDefault(); if (busy) return; setBusy(true); try { await post(`${base}/verify`, { email, code }); await onDone(); } catch (x) { onError(msg(x)); setCode(""); } setBusy(false); };
  return (
    <Card title="Request access">
      {!to ? (
        <form onSubmit={send} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ margin: 0, color: "var(--ink-2)" }}>Confirm your work email to request documents, accept the NDA or subscribe to updates. We send a one-time code.</p>
          <div className="field" style={{ margin: 0 }}><label htmlFor="tp-email">Work email</label><input className="input" id="tp-email" type="email" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><button type="submit" className="btn btn-primary sm" disabled={busy}>Send code</button></div>
        </form>
      ) : (
        <form onSubmit={check} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ margin: 0, color: "var(--ink-2)" }}>We sent a 6-digit code to {to}. It works once, for 10 minutes.</p>
          <div className="field" style={{ margin: 0 }}><label htmlFor="tp-code">Code</label><input className="input num" id="tp-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></div>
          <div style={{ display: "flex", gap: 8 }}><button type="submit" className="btn btn-primary sm" disabled={busy || code.length !== 6}>Confirm</button><button type="button" className="btn btn-ghost sm" onClick={() => { setTo(""); setCode(""); }}>Use another address</button></div>
        </form>
      )}
    </Card>
  );
}
function Ask({ base }: { base: string }) {
  const [q, setQ] = useState(""); const [a, setA] = useState<{ ans: boolean; reply: string } | null>(null); const [err, setErr] = useState("");
  const go = async (e: React.FormEvent) => { e.preventDefault(); setErr(""); try { const r = await post<{ ans: string | null; reply: string }>(`${base}/questions`, { q }); setA({ ans: !!r.ans, reply: r.reply }); } catch (x) { setErr(msg(x)); } };
  return (
    <Card title="Ask a question">
      <form onSubmit={go} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label className="vh" htmlFor="tp-q">Your question</label>
        <textarea className="input" id="tp-q" rows={3} maxLength={1000} value={q} onChange={(e) => setQ(e.target.value)} placeholder="For example: do you encrypt data at rest?" />
        <div><button type="submit" className="btn btn-secondary sm" disabled={!q.trim()}>Ask</button></div>
      </form>
      {err ? <p role="alert" style={{ margin: 0, color: "var(--bad-ink)" }}>{err}</p> : null}
      {a ? <div role="status" style={{ background: "var(--surface-2)", borderRadius: 10, padding: "10px 12px" }}><div className="strong" style={{ marginBottom: 4 }}>{a.ans ? "Answer from published material" : "Needs a person"}</div><p style={{ margin: 0 }}>{a.reply}</p>{a.ans ? <p className="field help" style={{ margin: "6px 0 0" }}>For anything binding, request the documents under NDA.</p> : null}</div> : null}
    </Card>
  );
}
