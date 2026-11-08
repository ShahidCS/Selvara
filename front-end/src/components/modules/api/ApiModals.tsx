import { useRef, useState } from "react";
import { useLayer } from "@/hooks/useLayer";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { Icon } from "@/components/ui";
import { wsLog } from "@/lib/audit";
import { bumpData } from "@/lib/store";
import { clampText, isSafeWebhookUrl, logSafeUrl } from "@/lib/security";
import * as svc from "@/services/api";
import { attempt } from "./../sodKit";

const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;
const errStyle = { color: "var(--bad-ink)" } as const;

/** Key shown ONCE after creation. The plaintext lives only in this component's props/state; it is dropped when the modal closes. */
function KeyCreated({ full, label, scope, close }: { full: string; label: string; scope: string; close: () => void }) {
  const L = useLayer(); const ref = useRef<HTMLInputElement>(null);
  const copy = async () => {
    try { await navigator.clipboard.writeText(full); L.toast("Copied to clipboard"); }
    catch { ref.current?.focus(); ref.current?.select(); L.toast("Select and copy the key"); }
  };
  return (
    <>
      <p style={{ margin: "0 0 10px" }}>Copy this key now. For security it will not be shown again.</p>
      <div className="field"><input ref={ref} className="input num" id="ak-full" readOnly value={full} style={{ fontSize: 12 }} aria-label="New API key (demo)" autoComplete="off" spellCheck={false} /></div>
      <p className="field help">{label} · {scope} scope</p>
      <p className="field help">Demo key only: generated in this browser, accepted by nothing.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={copy}><Icon name="download" />Copy key</button><button className="btn btn-primary" onClick={close}>Done</button></LayerFoot>
    </>
  );
}

/** Prototype: apiNewKey / apiDoNewKey. */
export function NewKeyForm({ close }: { close: () => void }) {
  const L = useLayer();
  const [label, setLabel] = useState(""); const [scope, setScope] = useState("Read"); const [err, setErr] = useState(false);
  const submit = () => attempt(L, async () => {
    const lb = clampText(label, 80);
    if (!lb) { setErr(true); return; }
    const sc = svc.KEY_SCOPES.includes(scope) ? scope : "Read";
    const k = await svc.createKey({ label: lb, scope: sc });
    if (k.pending) { wsLog("api.key.requested", lb + " (" + sc + ")", "System"); close(); L.toast("Write-scope key requested; a second admin must approve it"); bumpData(); return; }
    wsLog("api.key.created", lb + " (" + sc + ")", "System"); // never log the key
    const full = k.full || "";
    L.openModal("API key created", (c) => <KeyCreated full={full} label={lb} scope={sc} close={() => { c(); bumpData(); }} />);
  });
  return (
    <>
      <div className="field"><label htmlFor="ak-label">Label <Req /></label><input className="input" id="ak-label" data-focus maxLength={80} placeholder="e.g. Reporting service" value={label} onChange={(e) => setLabel(e.target.value)} aria-invalid={err} aria-describedby={err ? "ak-err" : undefined} /></div>
      <div className="field"><label htmlFor="ak-scope">Scope</label><select className="select" id="ak-scope" value={scope} onChange={(e) => setScope(e.target.value)}>{svc.KEY_SCOPES.map((s) => <option key={s}>{s}</option>)}</select></div>
      <p className="field help">The full key is shown once and cannot be retrieved later. Store it securely.</p>
      {scope === "Read/Write" ? <p className="field help">Write-scope keys have no secret until a second admin approves the request. The key is then shown once, to you only.</p> : null}
      <p className="field help" id="ak-err" role="alert" style={{ ...errStyle, display: err ? "block" : "none" }}>Label is required.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={submit}>Create key</button></LayerFoot>
    </>
  );
}

/** Prototype: apiRevokeKey / apiDoRevoke. */
export function RevokeKeyForm({ id, close }: { id: string; close: () => void }) {
  const L = useLayer(); const k = svc.API.keys.find((x) => x.id === id);
  if (!k) return <p style={{ margin: 0 }}>Key not found.</p>;
  const go = () => attempt(L, async () => {
    const r = await svc.revokeKey(id); if (!r) { L.toast("Key not found", false); return; }
    wsLog("api.key.revoked", r.label, "System"); close(); L.toast("Key revoked"); bumpData();
  });
  return (
    <>
      <p style={{ margin: 0 }}>Revoke <strong>{k.label}</strong> ({k.prefix})? Any client using this key will immediately lose access.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-danger" onClick={go}>Revoke key</button></LayerFoot>
    </>
  );
}

/** Prototype: whAdd / whDoAdd. URL must pass the strict https-only / no-internal-host check. */
export function WebhookForm({ close }: { close: () => void }) {
  const L = useLayer();
  const [url, setUrl] = useState(""); const [err, setErr] = useState(false);
  const [sel, setSel] = useState<string[]>(svc.WH_EVENTS.slice(0, 2));
  const submit = () => attempt(L, async () => {
    const u = url.trim();
    if (!isSafeWebhookUrl(u)) { setErr(true); return; }
    await svc.addWebhook({ url: u, events: svc.WH_EVENTS.filter((e) => sel.includes(e)) });
    wsLog("webhook.requested", logSafeUrl(u), "System"); close(); L.toast("Webhook added; a second admin must approve it before it delivers"); bumpData();
  });
  return (
    <>
      <div className="field"><label htmlFor="wh-url">Endpoint URL <Req /></label><input className="input" id="wh-url" data-focus maxLength={2048} inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://hooks.example.com/grc" value={url} onChange={(e) => setUrl(e.target.value)} aria-invalid={err} aria-describedby={err ? "wh-err" : undefined} /></div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
        <legend style={{ padding: 0, fontSize: "inherit", fontWeight: "inherit" }}>Events</legend>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
          {svc.WH_EVENTS.map((e) => (
            <label key={e} style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400, fontSize: 13 }}>
              <input type="checkbox" className="wh-ev" value={e} checked={sel.includes(e)} onChange={(ev) => setSel((p) => ev.target.checked ? [...p, e] : p.filter((x) => x !== e))} /> {e}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="field help">A signing secret (HMAC-SHA256) is generated automatically. Verify the signature on every delivery.</p>
      <p className="field help">A new webhook does not deliver anything until a second admin approves it.</p>
      <p className="field help" id="wh-err" role="alert" style={{ ...errStyle, display: err ? "block" : "none" }}>A valid https URL is required.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={submit}>Request webhook</button></LayerFoot>
    </>
  );
}

/** Prototype: ctNew / ctDoNew. Name/target are stored as plain text; nothing here is ever executed. */
export function TestForm({ close }: { close: () => void }) {
  const L = useLayer();
  const [name, setName] = useState(""); const [target, setTarget] = useState(""); const [sched, setSched] = useState(svc.TEST_SCHEDULES[0]); const [err, setErr] = useState(false);
  const submit = () => attempt(L, async () => {
    const n = clampText(name, 120);
    if (!n) { setErr(true); return; }
    await svc.createTest({ name: n, target: clampText(target, 80), schedule: sched });
    wsLog("customtest.created", n, "Control"); close(); L.toast("Custom test created"); bumpData();
  });
  return (
    <>
      <div className="field"><label htmlFor="ct-name">Test name <Req /></label><input className="input" id="ct-name" data-focus maxLength={120} placeholder="e.g. Database encryption at rest" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={err} aria-describedby={err ? "ct-err" : undefined} /></div>
      <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="field"><label htmlFor="ct-target">Target</label><input className="input" id="ct-target" maxLength={80} placeholder="e.g. Meridian" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
        <div className="field"><label htmlFor="ct-sched">Schedule</label><select className="select" id="ct-sched" value={sched} onChange={(e) => setSched(e.target.value)}>{svc.TEST_SCHEDULES.map((s) => <option key={s}>{s}</option>)}</select></div>
      </div>
      <p className="field help" id="ct-err" role="alert" style={{ ...errStyle, display: err ? "block" : "none" }}>Test name is required.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={submit}>Create test</button></LayerFoot>
    </>
  );
}

/** Shows the approved key once to the admin who requested it. The secret is dropped from memory the moment it is revealed. */
export function RevealKeyModal({ id, close }: { id: string; close: () => void }) {
  const L = useLayer();
  const [k, setK] = useState<{ full: string; label: string; scope: string } | null>(null);
  const show = () => attempt(L, async () => {
    const r = await svc.revealKey(id); setK(r); bumpData();
  });
  if (k) return <KeyCreated full={k.full} label={k.label} scope={k.scope} close={() => { setK(null); close(); bumpData(); }} />;
  return (
    <>
      <p style={{ margin: "0 0 10px" }}>A second admin approved this key. It can be shown once, to you only, and then it is gone for good. Make sure nobody can see your screen.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Later</button><button className="btn btn-primary" onClick={show}>Show key once</button></LayerFoot>
    </>
  );
}
