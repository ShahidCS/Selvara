import { useState } from "react";
import { LayerFoot } from "@/hooks/useLayer";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { DATA } from "@/lib/data";
import { wsLog } from "@/lib/audit";
import { bumpData } from "@/lib/store";
import { clampText, isEmail } from "@/lib/security";
import { TRUST } from "@/lib/trustData";
import * as svc from "@/services/trust";
import { attempt } from "@/components/kit/sodKit";

const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;
const FAIL = "Something went wrong. Please try again.";

/* ---- admin: deny request (source trustDeny / trustDoDeny) ---- */
export function DenyForm({ id, L }: { id: string; L: LayerApi }) {
  const r = TRUST.requests.find((x) => x.id === id);
  const [note, setNote] = useState("");
  if (!r) return <p className="field help">Request not found.</p>;
  const submit = () => attempt(L, async () => {
    const n = clampText(note, 300);
    const out = await svc.denyRequest(id, n);
    if (!out) return;
    wsLog("trust.access.denied", out.who + (n ? " (" + n + ")" : ""), "Policy");
    L.closeLayer(); L.toast("Request denied"); bumpData();
  });
  return (
    <>
      <div>
        <p style={{ margin: "0 0 8px", fontSize: 13 }}>Deny <strong>{r.who}</strong> access to {r.resource}. The requester is notified with your note.</p>
        <div className="field"><label htmlFor="td-note">Note to requester</label><input className="input" id="td-note" data-focus maxLength={300} placeholder="e.g. Please request from a business email domain" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className="btn btn-primary" onClick={submit}>Deny with notice</button></LayerFoot>
    </>
  );
}

/* ---- admin: block a domain (source trustAddBlocked / trustDoBlock) ---- */
export function BlockDomainForm({ L }: { L: LayerApi }) {
  const [dom, setDom] = useState(""); const [err, setErr] = useState(false);
  const submit = () => attempt(L, async () => {
    const d = clampText(dom, 253).toLowerCase().replace(/^@/, "");
    if (!d) { setErr(true); return; }
    await svc.blockDomain(d);
    wsLog("trust.domain.blocked", d, "Policy");
    L.closeLayer(); L.toast(d + " blocked"); bumpData();
  });
  return (
    <>
      <div>
        <p style={{ margin: "0 0 8px", fontSize: 13 }}>Access requests from this email domain are automatically flagged and cannot be approved.</p>
        <div className="field"><label htmlFor="tb-dom">Domain <Req /></label><input className="input" id="tb-dom" data-focus maxLength={253} placeholder="e.g. freemail.example" value={dom} onChange={(e) => setDom(e.target.value)} aria-invalid={err} aria-describedby={err ? "tb-err" : undefined} /></div>
        <p className="field help" id="tb-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Enter a domain.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className="btn btn-primary" onClick={submit}>Block</button></LayerFoot>
    </>
  );
}

/* ---- admin: publish resource (source trustPublish / trustDoPublish) ---- */
const VIS = ["Public", "On request, NDA"];
export function PublishForm({ L }: { L: LayerApi }) {
  const [name, setName] = useState(""); const [access, setAccess] = useState("Public"); const [err, setErr] = useState(false);
  const submit = () => attempt(L, async () => {
    const n = clampText(name, 160);
    if (!n) { setErr(true); return; }
    const a = VIS.includes(access) ? access : "On request, NDA"; // enum check, deny by default
    const r = await svc.publishResource(n, a);
    if (r.pending) { wsLog("trust.resource.publish_requested", n + " (public)", "Policy"); L.closeLayer(); L.toast("Public publishing needs approval from a different admin or owner"); bumpData(); return; }
    wsLog("trust.resource.published", n, "Policy");
    L.closeLayer(); L.toast("Resource published to Trust Center"); bumpData();
  });
  return (
    <>
      <div>
        <div className="field"><label htmlFor="tp-name">Resource name <Req /></label><input className="input" id="tp-name" data-focus maxLength={160} placeholder="e.g. CAIQ self-assessment 2026" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={err} aria-describedby={err ? "tp-err" : undefined} /></div>
        <div className="field"><label htmlFor="tp-access">Visibility</label><select className="select" id="tp-access" value={access} onChange={(e) => setAccess(e.target.value)}><option>Public</option><option>On request, NDA</option></select></div>
        <p className="field help">Publishing as Public is a four-eyes step: it is listed only after a different admin or owner approves it. On-request resources are listed at once.</p>
        <p className="field help" id="tp-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Resource name is required.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className="btn btn-primary" onClick={submit}>{access === "Public" ? "Request publishing" : "Publish"}</button></LayerFoot>
    </>
  );
}

/* ---- public: subscribe (source trustSubscribe / trustDoSubscribe) ---- */
export function SubscribeForm({ L }: { L: LayerApi }) {
  const [email, setEmail] = useState(""); const [err, setErr] = useState(false);
  const submit = async () => {
    const em = clampText(email, 254);
    if (!isEmail(em)) { setErr(true); return; }
    try {
      await svc.subscribeUpdates(em);
      wsLog("trust.subscribed", em, "Policy");
      L.closeLayer(); L.toast("Subscribed to Trust Center updates");
    } catch { L.toast(FAIL, false); }
  };
  return (
    <>
      <div>
        <div className="field"><label htmlFor="ts-email">Email <Req /></label><input className="input" id="ts-email" data-focus type="email" maxLength={254} placeholder="name@company.example" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={err} aria-describedby={err ? "ts-err" : undefined} /></div>
        <p className="field help" id="ts-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Enter a valid email address.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className="btn btn-primary" onClick={submit}>Subscribe</button></LayerFoot>
    </>
  );
}

/* ---- public: request access to a document (source trustRequest / trustDoRequest) ---- */
export function RequestAccessForm({ i, L }: { i: number; L: LayerApi }) {
  const t = DATA.trust[i];
  const [email, setEmail] = useState(""); const [note, setNote] = useState(""); const [err, setErr] = useState(false);
  if (!t) return <p className="field help">Resource not found.</p>;
  const submit = () => attempt(L, async () => {
    const em = clampText(email, 254);
    if (!isEmail(em)) { setErr(true); return; }
    const out = await svc.requestAccess(i, em, clampText(note, 300)); // enqueues for the admins; the reply is the same whether or not it was queued
    wsLog(out.queued ? "trust.access.requested" : "trust.access.request.ignored", t.name + " by " + em, "Policy");
    L.closeLayer(); L.toast("Access request submitted");
  });
  return (
    <>
      <div>
        <p style={{ margin: "0 0 8px" }}>This resource is shared on request under NDA. Submit a request and the security team will review it.</p>
        <div className="field"><label htmlFor="tr-email">Your work email <Req /></label><input className="input" id="tr-email" data-focus type="email" maxLength={254} placeholder="name@company.example" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={err} aria-describedby={err ? "tr-err" : undefined} /></div>
        <div className="field"><label htmlFor="tr-note">Reason</label><input className="input" id="tr-note" maxLength={300} placeholder="e.g. Vendor due diligence" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <p className="field help">{svc.REQUEST_ACCESS_COPY}</p>
        <p className="field help" id="tr-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Enter a valid email address.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className="btn btn-primary" onClick={submit}>Submit request</button></LayerFoot>
    </>
  );
}
