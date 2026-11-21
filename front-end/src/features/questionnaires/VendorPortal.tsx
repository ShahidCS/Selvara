import { useState, useSyncExternalStore } from "react";
import { Empty, FormMessage, Icon, Page, StatusChip } from "@/components/ui";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { wsLog } from "@/lib/audit";
import { clampText } from "@/lib/security";
import { VENDOR_Q, setVendorAnswer } from "@/lib/trustData";
import * as svc from "@/features/questionnaires/services/questionnaires";
import { API_ON } from "@/lib/rbac";
import { uiMessage } from "@/lib/grcSod";
import { g4Meta, type WsVendorQ } from "@/services/ws";

const FAIL = "Something went wrong. Please try again.";
const MAXLEN = 4000;
const PORTAL_TITLE = "Security questionnaires";
const PORTAL_SUB = "Questionnaires your customers sent you to answer";
/** Indexes of required questions left blank. */
const blanks = (qs: { required?: boolean }[], ans: string[]) => qs.map((x, i) => (x.required && !String(ans[i] ?? "").trim() ? i : -1)).filter((i) => i >= 0);
/** Error summary above the submit buttons; each missing answer is also marked under its question. */
function MissingSummary({ n }: { n: number }) {
  return n ? <div style={{ margin: "12px 0 0" }}><FormMessage id="vq-sum">{n === 1 ? "1 required question still needs an answer." : `${n} required questions still need answers.`} They are marked below their question.</FormMessage></div> : null;
}
const focusFirst = (miss: number[]) => { if (miss.length) document.getElementById("vq-" + miss[0])?.focus(); };

/** Vendor role view of Questionnaires (source vendorPortal / vendorSaveDraft / vendorSubmit, lines 3460-3467). */
export default function VendorPortal({ L }: { L: LayerApi }) { return API_ON ? <VendorPortalLive L={L} /> : <VendorPortalDemo L={L} />; }

/** Production: the questionnaires a customer sent to this member (role Vendor), answered here and locked once submitted. */
function VendorPortalLive({ L }: { L: LayerApi }) {
  const list = useSyncExternalStore(g4Meta.subscribe, () => g4Meta.get().assigned, () => g4Meta.get().assigned);
  const [open, setOpen] = useState<string>("");
  const q = list.find((x) => x.id === open) ?? list.find((x) => x.status !== "Submitted") ?? list[0];
  return (
    <Page mod="questionnaires" title={PORTAL_TITLE} sub={PORTAL_SUB} acts={<span className="tag"><Icon name="access" />Vendor portal</span>}>
      <div className="scroll" style={{ overflow: "auto" }}><div style={{ maxWidth: 760, margin: "0 auto" }}>
        {!list.length ? <Empty icon="questionnaires" title="No questionnaires yet">When a customer sends you a security questionnaire, it appears here.</Empty> : null}
        {list.length > 1 ? <div className="btngrp" data-tour="questionnaires-portal-list" style={{ marginBottom: 12, flexWrap: "wrap" }}>{list.map((x) => <button key={x.id} className={`btn sm ${x.id === q?.id ? "btn-primary" : "btn-secondary"}`} onClick={() => setOpen(x.id)}>{x.customer}: {x.vendor} ({x.status})</button>)}</div> : null}
        {q ? <AssignedForm key={q.id + q.status} q={q} L={L} /> : null}
      </div></div>
    </Page>
  );
}
function AssignedForm({ q, L }: { q: WsVendorQ; L: LayerApi }) {
  const [ans, setAns] = useState<string[]>(() => q.questions.map((_, i) => q.answers[i] ?? ""));
  const locked = q.status === "Submitted";
  const answered = ans.filter((a) => a.trim()).length;
  const set = (i: number, v: string) => setAns((p) => p.map((x, j) => (j === i ? v.slice(0, MAXLEN) : x)));
  const [miss, setMiss] = useState<number[] | null>(null);
  const run = async (fn: () => Promise<unknown>, msg: string, submitting = false) => {
    try { await fn(); setMiss(null); L.toast(msg); }
    catch (e) { if (submitting) { const m = blanks(q.questions, ans); setMiss(m); focusFirst(m); } L.toast(uiMessage(e), false); }
  };
  return (
    <>
      <div className="card" data-tour="questionnaires-portal" style={{ background: "var(--accent-weak)", borderColor: "transparent", marginBottom: 14 }}><div className="c-body" style={{ padding: 18 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><div style={{ fontWeight: 600, fontSize: 17 }}>Security questionnaire — {q.customer}</div><StatusChip s={locked ? "Complete" : q.status === "Reopened" ? "Review" : "Pending"} /></div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>About {q.vendor}, sent {q.at} by {q.sentBy}. {answered}/{q.questions.length} answered.</div>
        {q.status === "Reopened" && q.note ? <p className="field help" style={{ margin: "8px 0 0" }}>Clarification requested: {q.note}</p> : null}
        {locked ? <p className="field help" style={{ margin: "8px 0 0" }}>Submitted {q.submittedAt}. Your customer can reopen it if they need more.</p> : null}
      </div></div>
      {q.questions.map((x, i) => (
        <div className="card" key={i} style={{ marginBottom: 10 }}><div className="c-body">
          <label htmlFor={"vq-" + i} style={{ display: "block", fontWeight: 500, marginBottom: 6 }}>{i + 1}. {x.q} {x.required ? <span style={{ color: "var(--bad-ink)" }}>*</span> : <span className="meta">(optional)</span>}</label>
          <textarea className="input" id={"vq-" + i} rows={2} maxLength={MAXLEN} readOnly={locked} style={{ resize: "vertical" }} value={ans[i] ?? ""} onChange={(e) => set(i, e.target.value)} placeholder="Your answer…"
            aria-invalid={!!miss?.includes(i) && !ans[i]?.trim()} aria-describedby={miss?.includes(i) && !ans[i]?.trim() ? "vq-" + i + "-err" : undefined} />
          {miss?.includes(i) && !ans[i]?.trim() ? <FormMessage id={"vq-" + i + "-err"}>This question needs an answer.</FormMessage> : null}
        </div></div>
      ))}
      {!locked ? <MissingSummary n={(miss || []).filter((i) => !ans[i]?.trim()).length} /> : null}
      {!locked ? <div data-tour="questionnaires-portal-submit" style={{ display: "flex", gap: 8, margin: "12px 0 24px", flexWrap: "wrap" }}>
        <button className="btn btn-secondary" onClick={() => run(() => svc.saveAssigned(q.id, ans), "Draft saved")}><Icon name="check" />Save draft</button>
        <button className="btn btn-primary" onClick={() => run(() => svc.submitAssigned(q.id, ans), "Questionnaire submitted to " + q.customer, true)}><Icon name="check" />Submit to {q.customer}</button>
      </div> : null}
    </>
  );
}

function VendorPortalDemo({ L }: { L: LayerApi }) {
  const [ans, setAns] = useState<string[]>(() => VENDOR_Q.map((q) => q.a));
  const answered = ans.filter((a) => a.trim()).length;
  const total = VENDOR_Q.length;
  // source mutated VENDOR_Q[i].a on every input event
  const set = (i: number, v: string) => { const n = v.slice(0, MAXLEN); setVendorAnswer(i, n); setAns((p) => p.map((x, j) => (j === i ? n : x))); };
  const clean = () => ans.map((a) => clampText(a, MAXLEN));
  const [miss, setMiss] = useState<number[] | null>(null);
  const saveDraft = async () => { try { await svc.saveVendorAnswers(clean()); L.toast("Draft saved"); } catch { L.toast(FAIL, false); } };
  const submit = async () => {
    try {
      const missing = await svc.submitVendorQuestionnaire(clean());
      if (missing) { const m = blanks(VENDOR_Q, ans); setMiss(m); focusFirst(m); return; }
      setMiss(null);
      wsLog("vendor.questionnaire.submitted", "ACME security questionnaire", "Vendor");
      L.toast("Questionnaire submitted to ACME Ltd");
    } catch { L.toast(FAIL, false); }
  };
  return (
    <Page mod="questionnaires" title={PORTAL_TITLE} sub={PORTAL_SUB} acts={<span className="tag"><Icon name="access" />Vendor portal</span>}>
      <div className="scroll" style={{ overflow: "auto" }}><div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div className="card" data-tour="questionnaires-portal" style={{ background: "var(--accent-weak)", borderColor: "transparent", marginBottom: 14 }}><div className="c-body" style={{ padding: 18 }}>
          <div style={{ fontWeight: 600, fontSize: 17 }}>Security questionnaire — ACME Ltd</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>Requested from your organisation. {answered}/{total} answered.</div>
          <div className="bar-track" style={{ marginTop: 10 }}>{answered > 0 ? <span className="bar-fill" style={{ width: `${Math.round((answered / total) * 100)}%`, background: "var(--accent)" }}></span> : null}</div>
        </div></div>
        {VENDOR_Q.map((q, i) => (
          <div className="card" key={i} style={{ marginBottom: 10 }}><div className="c-body">
            <label htmlFor={"vq-" + i} style={{ display: "block", fontWeight: 500, marginBottom: 6 }}>{i + 1}. {q.q} {q.required ? <span style={{ color: "var(--bad-ink)" }}>*</span> : <span className="meta">(optional)</span>}</label>
            <textarea className="input" id={"vq-" + i} rows={2} maxLength={MAXLEN} style={{ resize: "vertical" }} value={ans[i] ?? ""} onChange={(e) => set(i, e.target.value)} placeholder="Your answer…"
              aria-invalid={!!miss?.includes(i) && !ans[i]?.trim()} aria-describedby={miss?.includes(i) && !ans[i]?.trim() ? "vq-" + i + "-err" : undefined} />
            {miss?.includes(i) && !ans[i]?.trim() ? <FormMessage id={"vq-" + i + "-err"}>This question needs an answer.</FormMessage> : null}
          </div></div>
        ))}
        <MissingSummary n={(miss || []).filter((i) => !ans[i]?.trim()).length} />
        <div data-tour="questionnaires-portal-submit" style={{ display: "flex", gap: 8, margin: "12px 0 24px", flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={saveDraft}><Icon name="check" />Save draft</button>
          <button className="btn btn-primary" onClick={submit}><Icon name="check" />Submit to ACME Ltd</button>
        </div>
      </div></div>
    </Page>
  );
}
