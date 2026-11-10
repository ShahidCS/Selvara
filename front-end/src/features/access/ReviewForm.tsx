import { useState } from "react";
import { useLayer } from "@/hooks/useLayer";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { sodMessage } from "@/lib/approvalFlow";
import { bumpData, setModState } from "@/lib/store";
import { clampText } from "@/lib/security";
import * as svc from "@/services/access";

/** "Create access review" modal (prototype: accCreateReview / accDoCreateReview). */
export function ReviewForm({ close }: { close: () => void }) {
  const L = useLayer();
  const [name, setName] = useState(""); const [scope, setScope] = useState("All privileged accounts"); const [err, setErr] = useState(false);
  const submit = async () => {
    const n = clampText(name, 120);
    if (!n) { setErr(true); return; }
    try {
      await svc.createReview({ name: n, scope: clampText(scope, 160) });
      close(); L.toast("Access review started");
      setModState("access.view", "reviews"); bumpData();
    } catch (e) { L.toast(sodMessage(e, "Could not start the review"), false); }
  };
  return (
    <>
      <div className="field"><label htmlFor="arv-name">Review name <span style={{ color: "var(--bad-ink)" }}>*</span></label><input className="input" id="arv-name" data-focus maxLength={120} placeholder="e.g. Q1 2027 recertification" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={err} aria-describedby={err ? "arv-err" : undefined} /></div>
      <div className="field"><label htmlFor="arv-scope">Scope</label><input className="input" id="arv-scope" maxLength={160} value={scope} onChange={(e) => setScope(e.target.value)} /></div>
      <p className="field help">Starting a review freezes the account scope at this point in time.</p>
      <p className="field help" id="arv-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Review name is required.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={submit}>Start review &amp; freeze scope</button></LayerFoot>
    </>
  );
}
