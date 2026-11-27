import { useEffect, useRef, useState, type FormEvent } from "react";
import Router from "next/router";
import { Empty, FormActions, FormMessage, FormSection, Page } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { wsLog } from "@/lib/audit";
import { bumpData, useApp, useData } from "@/lib/store";
import { useGo } from "@/lib/route";
import { clampText, isSafeWebhookUrl, logSafeUrl } from "@/lib/security";
import { FAIL_MSG, uiMessage } from "@/lib/grcSod";
import * as svc from "@/features/api/services/api";
import { KeyCreated } from "./ApiModals";
import { API_ON } from "@/lib/rbac";

const LIST = "/ws/api";
const back = { href: LIST, label: "API, Webhooks & Custom Tests" };
const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;
const Denied = ({ title }: { title: string }) => <Page title={title} back={back}><Empty icon="ext" title="You cannot do this">Only an admin can change API keys, webhooks and custom tests.</Empty></Page>;

/** `/ws/api/new-key`: a read key is issued at once and shown ONCE in a dialog (never stored or logged); a write-scope key waits for a second admin. */
export function NewKeyPage() {
  const role = useApp((s) => s.role);
  const L = useLayer(); const go = useGo();
  const [label, setLabel] = useState(""); const [scope, setScope] = useState("Read"); const [days, setDays] = useState(90); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const dirty = !busy && (label !== "" || scope !== "Read");
  const { allowLeave } = useUnsavedGuard(dirty, L);
  const ref = useRef<HTMLInputElement>(null); useEffect(() => { ref.current?.focus(); }, []);
  if (!svc.apiCanManage(role)) return <Denied title="New API key" />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const lb = clampText(label, 80);
    if (!lb) { setErr("Label is required."); ref.current?.focus(); return; }
    const sc = svc.KEY_SCOPES.includes(scope) ? scope : "Read";
    setBusy(true);
    try {
      const k = await svc.createKey({ label: lb, scope: sc, days });
      allowLeave(); bumpData();
      if (k.pending) { wsLog("api.key.requested", lb + " (" + sc + ")", "System"); L.toast("Write-scope key requested; a second admin must approve it"); go(LIST); return; }
      wsLog("api.key.created", lb + " (" + sc + ")", "System"); // never log the key
      const full = k.full || "";
      await Router.push(LIST); // the shell closes dialogs when the route changes, so show the key once the list is up
      L.openModal("API key created", (c) => <KeyCreated full={full} label={lb} scope={sc} close={() => { c(); bumpData(); }} />);
    } catch (x) { setBusy(false); setErr(""); L.toast(uiMessage(x) || FAIL_MSG, false); }
  };
  return (
    <Page title="New API key" sub="The full key is shown once and cannot be retrieved later." back={back}>
      <div className="scroll rec-scroll"><form className="rec-form" onSubmit={submit} noValidate>
        <FormSection n={1} title="Key" note="A label to recognise it by, and what it may do.">
          <div className="field"><label htmlFor="ak-label">Label <Req /></label><input ref={ref} className="input" id="ak-label" maxLength={80} placeholder="e.g. Reporting service" value={label} onChange={(e) => setLabel(e.target.value)} aria-invalid={!!err} aria-describedby={err ? "ak-err" : undefined} /></div>
          <div className="field"><label htmlFor="ak-scope">Scope</label><select className="select" id="ak-scope" value={scope} onChange={(e) => setScope(e.target.value)}>{svc.KEY_SCOPES.map((s) => <option key={s}>{s}</option>)}</select></div>
          {API_ON ? <div className="field"><label htmlFor="ak-days">Expires after</label><select className="select" id="ak-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>{svc.KEY_DAYS.map((d) => <option key={d} value={d}>{d} days</option>)}</select></div> : null}
          <p className="field help">Store the key securely once it is shown.{API_ON ? " Selvara keeps only a fingerprint of it. Send it as Authorization: Bearer <key> to /api/v1 (read the registers; a read/write key may also push events to /api/v1/events)." : ""}</p>
          {scope === "Read/Write" ? <p className="field help" role="note">Write-scope keys have no secret until a second admin approves the request. The key is then shown once, to you only.</p> : null}
        </FormSection>
        {err ? <FormMessage id="ak-err">{err}</FormMessage> : null}
        <FormActions><button type="button" className="btn btn-secondary" onClick={() => go(LIST)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>Create key</button></FormActions>
      </form></div>
    </Page>
  );
}

/** `/ws/api/new-webhook`: the URL must pass the strict https-only, no-internal-host check; a second admin approves before anything is delivered. */
export function NewWebhookPage() {
  const role = useApp((s) => s.role);
  const L = useLayer(); const go = useGo();
  useData(); // production: the event list arrives with the workspace data, possibly after this page opened
  const ev0 = svc.WH_EVENTS.slice(0, 2);
  const [url, setUrl] = useState(""); const [picked, setPicked] = useState<string[] | null>(null); const [err, setErr] = useState(""); const [errOn, setErrOn] = useState<"url" | "events">("url"); const [busy, setBusy] = useState(false);
  const evRef = useRef<HTMLFieldSetElement>(null);
  const sel = picked ?? ev0; // the first two events until the person changes the choice
  const setSel = (f: (p: string[]) => string[]) => setPicked(f(sel));
  const dirty = !busy && (url !== "" || sel.join() !== ev0.join());
  const { allowLeave } = useUnsavedGuard(dirty, L);
  const ref = useRef<HTMLInputElement>(null); useEffect(() => { ref.current?.focus(); }, []);
  if (!svc.apiCanManage(role)) return <Denied title="Add webhook" />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const u = url.trim();
    if (!isSafeWebhookUrl(u)) { setErr("A valid https URL is required."); setErrOn("url"); ref.current?.focus(); return; }
    if (!sel.length) { setErr("Choose at least one event."); setErrOn("events"); evRef.current?.querySelector("input")?.focus(); return; }
    setBusy(true);
    try {
      await svc.addWebhook({ url: u, events: svc.WH_EVENTS.filter((x) => sel.includes(x)) });
      wsLog("webhook.requested", logSafeUrl(u), "System"); allowLeave(); L.toast("Webhook added; a second admin must approve it before it delivers"); bumpData(); go(LIST);
    } catch (x) { setBusy(false); setErr(""); L.toast(uiMessage(x) || FAIL_MSG, false); }
  };
  return (
    <Page title="Add webhook" sub="A new webhook does not deliver anything until a second admin approves it." back={back}>
      <div className="scroll rec-scroll"><form className="rec-form" onSubmit={submit} noValidate>
        <FormSection n={1} title="Endpoint" note="Where signed events are sent. https only.">
          <div className="field"><label htmlFor="wh-url">Endpoint URL <Req /></label><input ref={ref} className="input" id="wh-url" maxLength={2048} inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://hooks.example.com/grc" value={url} onChange={(e) => setUrl(e.target.value)} aria-invalid={!!err && errOn === "url"} aria-describedby={err && errOn === "url" ? "wh-err" : undefined} /></div>
          <p className="field help">A signing secret (HMAC-SHA256) is generated automatically{API_ON ? " when a second admin approves the webhook, and shown once to you" : ""}. Verify the signature on every delivery{API_ON ? ": the x-selvara-signature header is v1= followed by the HMAC of \"<x-selvara-timestamp>.<body>\"" : ""}.</p>
        </FormSection>
        <FormSection n={2} title="Events" note="Which events this endpoint receives.">
          <fieldset ref={evRef} className="field" style={{ border: 0, padding: 0, margin: 0 }} aria-invalid={!!err && errOn === "events"} aria-describedby={err && errOn === "events" ? "wh-err" : undefined}>
            <legend className="vh">Events</legend>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {svc.WH_EVENTS.map((x) => (
                <label key={x} style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400, fontSize: ".8125rem" }}>
                  <input type="checkbox" className="wh-ev" style={{ accentColor: "var(--accent)" }} value={x} checked={sel.includes(x)} onChange={(ev) => setSel((p) => (ev.target.checked ? [...p, x] : p.filter((y) => y !== x)))} /> {x}
                </label>
              ))}
            </div>
          </fieldset>
        </FormSection>
        {err ? <FormMessage id="wh-err">{err}</FormMessage> : null}
        <FormActions><button type="button" className="btn btn-secondary" onClick={() => go(LIST)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>Request webhook</button></FormActions>
      </form></div>
    </Page>
  );
}

/** `/ws/api/new-test`: a custom test. Name and target are stored as plain text; nothing here is ever executed. */
export function NewTestPage() {
  const role = useApp((s) => s.role);
  const L = useLayer(); const go = useGo();
  const [name, setName] = useState(""); const [target, setTarget] = useState(""); const [sched, setSched] = useState(svc.TEST_SCHEDULES[0]); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const dirty = !busy && (name !== "" || target !== "" || sched !== svc.TEST_SCHEDULES[0]);
  const { allowLeave } = useUnsavedGuard(dirty, L);
  const ref = useRef<HTMLInputElement>(null); useEffect(() => { ref.current?.focus(); }, []);
  if (!svc.apiCanManage(role)) return <Denied title="New custom test" />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = clampText(name, 120);
    if (!n) { setErr("Test name is required."); ref.current?.focus(); return; }
    setBusy(true);
    try {
      await svc.createTest({ name: n, target: clampText(target, 80), schedule: sched });
      wsLog("customtest.created", n, "Control"); allowLeave(); L.toast("Custom test created"); bumpData(); go(LIST);
    } catch (x) { setBusy(false); setErr(""); L.toast(uiMessage(x) || FAIL_MSG, false); }
  };
  return (
    <Page title="New custom test" sub="An automated check on your own resources." back={back}>
      <div className="scroll rec-scroll"><form className="rec-form" onSubmit={submit} noValidate>
        <FormSection n={1} title="Test" note="What is checked, against what, and how often.">
          <div className="field"><label htmlFor="ct-name">Test name <Req /></label><input ref={ref} className="input" id="ct-name" maxLength={120} placeholder="e.g. Database encryption at rest" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!err} aria-describedby={err ? "ct-err" : undefined} /></div>
          <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field"><label htmlFor="ct-target">Target{API_ON ? <> <Req /></> : null}</label><input className="input" id="ct-target" maxLength={80} placeholder="e.g. Meridian" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
            <div className="field"><label htmlFor="ct-sched">Schedule</label><select className="select" id="ct-sched" value={sched} onChange={(e) => setSched(e.target.value)}>{svc.TEST_SCHEDULES.map((x) => <option key={x}>{x}</option>)}</select></div>
          {API_ON ? <p className="field help" style={{ gridColumn: "1 / -1" }}>The target is the resource name your systems push events for (POST /api/v1/events with a read/write key). The newest event&apos;s status gives Pass or Fail. &quot;On push&quot; tests are evaluated as events arrive; the others when they are due, the next time this page is opened.</p> : null}
          </div>
        </FormSection>
        {err ? <FormMessage id="ct-err">{err}</FormMessage> : null}
        <FormActions><button type="button" className="btn btn-secondary" onClick={() => go(LIST)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>Create test</button></FormActions>
      </form></div>
    </Page>
  );
}
