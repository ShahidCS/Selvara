import { Empty, SelectList } from "@/components/ui";
import { useState } from "react";
import { API_ON } from "@/lib/rbac";
import { uiMessage } from "@/lib/grcSod";
import { LayerFoot } from "@/hooks/useLayer";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { DATA } from "@/lib/data";
import { wsLog } from "@/lib/audit";
import { bumpData } from "@/lib/store";
import { clampText, isEmail } from "@/lib/security";
import { TRUST } from "@/lib/trustData";
import * as svc from "@/features/trust/services/trust";
import { isNdaDoc, NDA_DOCS } from "@/lib/trustSections";
import { attempt } from "@/components/kit/sodKit";

const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;

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
        <div className="field"><label htmlFor="tp-access">Visibility</label><SelectList className="select" id="tp-access" value={access} onChange={(e) => setAccess(e.target.value)}><option>Public</option><option>On request, NDA</option></SelectList></div>
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
    if (!API_ON && !isEmail(em)) { setErr(true); return; } // production subscribes the signed-in member
    try {
      await svc.subscribeUpdates(em);
      wsLog("trust.subscribed", em, "Policy");
      L.closeLayer(); L.toast("Subscribed to Trust Center updates");
    } catch (e) { L.toast(uiMessage(e), false); }
  };
  return (
    <>
      <div>
        {API_ON ? <p style={{ margin: 0 }}>We will send Trust Center updates to the email address of your Selvara account once email is set up.</p> : <div className="field"><label htmlFor="ts-email">Email <Req /></label><input className="input" id="ts-email" data-focus type="email" maxLength={254} placeholder="name@company.example" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={err} aria-describedby={err ? "ts-err" : undefined} /></div>}
        <p className="field help" id="ts-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Enter a valid email address.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className="btn btn-primary" onClick={submit}>Subscribe</button></LayerFoot>
    </>
  );
}

/* ---- public: request documents under NDA (source trustRequest / trustDoRequest). F1-02: their names are not shown before they are
   granted, so the request names none; the security team chooses which to grant. ---- */
export function RequestAccessForm({ L }: { L: LayerApi }) {
  const [email, setEmail] = useState(""); const [note, setNote] = useState(""); const [err, setErr] = useState(""); const [reasonErr, setReasonErr] = useState(false);
  const submit = () => attempt(L, async () => {
    const em = clampText(email, 254);
    if (!API_ON && !isEmail(em)) { setErr("Enter a valid email address."); return; } // production requests for the signed-in member
    const why = clampText(note, 300); if (why.length < 10) { setReasonErr(true); return; }
    const out = await svc.requestAccess(em, why); // enqueues for the admins; the reply is the same whether or not it was queued
    wsLog(out.queued ? "trust.access.requested" : "trust.access.request.ignored", NDA_DOCS + (API_ON ? "" : " by " + em), "Policy");
    L.closeLayer(); L.toast("Request sent. You are told when it is decided.");
  });
  return (
    <>
      <div>
        <p style={{ margin: "0 0 8px" }}>Documents under NDA are shared on request. Say why you need them; the security team decides which documents to share with you. You accept the NDA yourself before you open them.</p>
        {API_ON ? null : <div className="field"><label htmlFor="tr-email">Your work email <Req /></label><input className="input" id="tr-email" data-focus type="email" maxLength={254} placeholder="name@company.example" value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby={err ? "tr-err" : undefined} /></div>}
        <p className="field help" id="tr-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
        <div className="field"><label htmlFor="tr-note">Reason <Req /></label><input className="input" id="tr-note" data-focus={API_ON ? true : undefined} maxLength={300} placeholder="e.g. Vendor due diligence for our 2026 renewal" value={note} onChange={(e) => { setNote(e.target.value); setReasonErr(false); }} aria-invalid={reasonErr} aria-describedby={reasonErr ? "tr-rerr" : undefined} /></div>
        <p className="field help" id="tr-rerr" role="alert" style={{ color: "var(--bad-ink)", display: reasonErr ? "block" : "none" }}>Give a reason of at least 10 characters.</p>
        <p className="field help">{API_ON ? "The request is made with your account's email address. You can send up to 3 requests an hour." : svc.REQUEST_ACCESS_COPY}</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className="btn btn-primary" onClick={submit}>Send request</button></LayerFoot>
    </>
  );
}

/* ---- admin: approve a request, choosing which documents under NDA to grant (F1-02) ---- */
export function ApproveForm({ id, L }: { id: string; L: LayerApi }) {
  const r = TRUST.requests.find((x) => x.id === id);
  const docs = DATA.trust.map((t, i) => ({ t, i })).filter((x) => isNdaDoc(x.t.access));
  const [sel, setSel] = useState<number[]>(() => docs.filter((x) => r && ((r.resourceId && x.t.id === r.resourceId) || x.t.name === r.resource)).map((x) => x.i));
  const [err, setErr] = useState(false);
  if (!r) return <p className="field help">Request not found.</p>;
  const submit = () => attempt(L, async () => {
    if (!sel.length) { setErr(true); return; }
    const out = await svc.approveRequest(id, sel);
    if (!out) return;
    wsLog("trust.access.approved", out.who + " → " + out.resource, "Policy");
    L.closeLayer(); L.toast("Access approved for " + out.who); bumpData();
  });
  return (
    <>
      <div>
        <p style={{ margin: "0 0 8px", fontSize: 13 }}><strong>{r.who}</strong> asked for {r.resource}. Reason: {r.reason}</p>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }} aria-describedby={err ? "ta-err" : undefined}>
          <legend style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Documents under NDA to share <Req /></legend>
          {docs.length ? docs.map(({ t, i }) => (
            <label key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
              <input type="checkbox" checked={sel.includes(i)} onChange={(e) => { setErr(false); setSel((s) => (e.target.checked ? [...s, i] : s.filter((x) => x !== i))); }} />{t.name}
            </label>
          )) : <Empty compact icon="evidence" title="No documents are under NDA" />}
        </fieldset>
        <p className="field help" id="ta-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{svc.NO_GRANT}</p>
        <p className="field help">The requester sees the names of these documents only, and accepts the NDA themselves before opening them.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className="btn btn-primary" onClick={submit}>Approve and share</button></LayerFoot>
    </>
  );
}
