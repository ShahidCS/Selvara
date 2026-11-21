import { Icon } from "@/components/ui";
import { useRef, useState } from "react";
import { useLayer } from "@/hooks/useLayer";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { wsLog } from "@/lib/audit";
import { bumpData } from "@/lib/store";
import * as svc from "@/features/api/services/api";
import { attempt } from "@/components/kit/sodKit";
import { API_ON } from "@/lib/rbac";


/** Key shown ONCE after creation. The plaintext lives only in this component's props/state; it is dropped when the modal closes. */
export function KeyCreated({ full, label, scope, close }: { full: string; label: string; scope: string; close: () => void }) {
  const L = useLayer(); const ref = useRef<HTMLInputElement>(null);
  const copy = async () => {
    try { await navigator.clipboard.writeText(full); L.toast("Copied to clipboard"); }
    catch { ref.current?.focus(); ref.current?.select(); L.toast("Copy did not work here. The key is selected: copy it yourself.", "info"); }
  };
  return (
    <>
      <p style={{ margin: "0 0 10px" }}>Copy this key now. For security it will not be shown again.</p>
      <div className="field"><input ref={ref} className="input num" id="ak-full" readOnly value={full} style={{ fontSize: 12 }} aria-label={API_ON ? "New API key" : "New API key (demo)"} autoComplete="off" spellCheck={false} /></div>
      <p className="field help">{label} · {scope} scope</p>
      <p className="field help">{API_ON ? "Selvara keeps only a fingerprint of this key: if it is lost, revoke it and create a new one." : "Demo key only: generated in this browser, accepted by nothing."}</p>
      <LayerFoot><button className="btn btn-secondary" onClick={copy}><Icon name="copy" />Copy key</button><button className="btn btn-primary" onClick={close}>Done</button></LayerFoot>
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

/** Shows the approved key once to the admin who requested it. The secret is dropped from memory the moment it is revealed. */
export function RevealKeyModal({ id, close }: { id: string; close: () => void }) {
  const L = useLayer();
  const [k, setK] = useState<{ full: string; label: string; scope: string } | null>(null);
  const show = () => attempt(L, async () => {
    const r = await svc.revealKey(id); bumpData();
    if (r.expired) { close(); L.toast(r.message || "The reveal window has expired.", false); return; }
    setK(r);
  });
  if (k) return <KeyCreated full={k.full} label={k.label} scope={k.scope} close={() => { setK(null); close(); bumpData(); }} />;
  return (
    <>
      <p style={{ margin: "0 0 10px" }}>A second admin approved this key. It can be shown once, to you only, and then it is gone for good. Make sure nobody can see your screen.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Later</button><button className="btn btn-primary" onClick={show}>Show key once</button></LayerFoot>
    </>
  );
}

/** Production: a webhook's signing secret, shown once to the admin who asked for the webhook. */
export function RevealSecretModal({ id, close }: { id: string; close: () => void }) {
  const L = useLayer(); const ref = useRef<HTMLInputElement>(null);
  const [s, setS] = useState<string | null>(null);
  const show = () => attempt(L, async () => { const r = await svc.revealHookSecret(id); setS(r.secret); bumpData(); });
  const copy = async () => { try { await navigator.clipboard.writeText(s || ""); L.toast("Copied to clipboard"); } catch { ref.current?.focus(); ref.current?.select(); L.toast("Copy did not work here. The secret is selected: copy it yourself.", "info"); } };
  if (s) return (
    <>
      <p style={{ margin: "0 0 10px" }}>Copy this signing secret now and store it where your endpoint verifies signatures. It will not be shown again.</p>
      <div className="field"><input ref={ref} className="input num" readOnly value={s} style={{ fontSize: 12 }} aria-label="Webhook signing secret" autoComplete="off" spellCheck={false} /></div>
      <LayerFoot><button className="btn btn-secondary" onClick={copy}><Icon name="copy" />Copy secret</button><button className="btn btn-primary" onClick={() => { setS(null); close(); }}>Done</button></LayerFoot>
    </>
  );
  return (
    <>
      <p style={{ margin: "0 0 10px" }}>A second admin approved this webhook. Its signing secret can be shown once, to you only. Make sure nobody can see your screen.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Later</button><button className="btn btn-primary" onClick={show}>Show secret once</button></LayerFoot>
    </>
  );
}
