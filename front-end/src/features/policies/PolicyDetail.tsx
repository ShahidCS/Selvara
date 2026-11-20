import { API_ON } from "@/lib/rbac";
import { Chip, Empty, Icon, Page, Ring, Stepper, StatusChip, Table, Timeline, type TimelineItem } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { wsLog } from "@/lib/audit";
import { ackOf } from "@/lib/me";
import { bumpData, useApp, useData } from "@/lib/store";
import { getActor } from "@/lib/sod";
import { useGo } from "@/lib/route";
import { isoDay, samePerson, uiMessage } from "@/lib/grcSod";
import { acknowledge } from "@/services/me";
import * as svc from "@/features/policies/services/policies";
import { ReassignForm, SubmitForm, VER_TONE, Why, openMapControl, reasonModal } from "./PolicyLayers";

const STEPS = [{ key: "draft", label: "Draft" }, { key: "review", label: "In review" }, { key: "approved", label: "Approved" }, { key: "published", label: "Published" }];
const STEP_OF: Record<string, number> = { Draft: 0, "In review": 1, Approved: 2 };
const tone = (what: string): TimelineItem["tone"] => (/publish|approv/i.test(what) ? "ok" : /reject|return|withdraw|emergency/i.test(what) ? "bad" : "brand");

/** A policy as a page (`/ws/policies/:id`): progress, details, the workflow actions, acceptance, mapped controls, version history and change log.
 *  Every action is the same service call as before; the short decision dialogs (reason, named approver, successor, control) remain dialogs. */
export function PolicyDetail({ id }: { id: string }) {
  useData(); useApp((s) => s.role);
  const L = useLayer(); const go = useGo();
  const back = { href: "/ws/policies", label: "Policies" };
  const p = svc.findPolicy(id);
  if (!p) return <Page title="Policy not found" back={back}><Empty icon="policies" title="No such policy">There is no policy with the ID &ldquo;{id}&rdquo;. It may have been removed, or the link may be wrong.</Empty></Page>;
  svc.polInit(p);
  const me = getActor(); const manager = me.base === "admin" || me.base === "owner";
  const live = svc.liveVersion(p), work = svc.workVersion(p);
  const state = svc.policyState(p);
  const open = svc.openExceptions(p);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); L.toast(ok); bumpData(); } catch (e) { L.toast(uiMessage(e), false); }
  };
  const remind = async () => { try { const out = await svc.remindOutstanding(id); L.toast("Reminder sent to " + out + " people"); } catch (e) { L.toast(uiMessage(e), false); } };
  const editWhy = svc.whyCannotEdit(p), submitWhy = svc.whyCannotSubmit(p), apprWhy = svc.whyCannotApprove(p), pubWhy = svc.whyCannotPublish(p), emWhy = svc.whyCannotEmergency(p);
  const a = p.acceptance; const myAck = live ? ackOf(me.name, p.id) : null;
  const btn = (label: string, icon: string, why: string | null, onClick: () => void, cls = "btn-secondary") =>
    <button className={`btn ${cls} sm`} disabled={!!why} title={why || undefined} onClick={onClick}><Icon name={icon} />{label}</button>;
  const canAckWhy = !live ? "Only a published policy can be acknowledged." : null;
  const step = work ? STEP_OF[work.status] ?? 0 : live ? 3 : 0;
  const log: TimelineItem[] = p.changeLog.slice().reverse().map((h: { at: string; ver: string; by: string; action: string; reason: string }, i: number) => ({
    id: String(i), at: h.at, title: `${h.action} (v${h.ver})`, sub: h.reason, actor: h.by, tone: tone(h.action),
  }));

  return (
    <Page title={p.name} sub={`${p.id}${live ? `, published v${live.ver}` : ", not published yet"}`} back={back} acts={<StatusChip s={state} />}>
      <div className="scroll rec-scroll">
        {open.map((x: svc.PolicyException) => {
          const st = svc.exceptionState(x);
          const why = svc.whyCannotDecideException(p, x);
          return (
            <div key={x.id} className="card" style={{ boxShadow: "none", background: "var(--warn-bg)", borderColor: "var(--warn-ink)", marginBottom: 12 }} role="alert"><div className="c-body" style={{ padding: 12 }}>
              <div style={{ fontWeight: 600 }}><Icon name="alert" /> Emergency change v{x.ver}: retrospective approval {st === "Overdue" ? "OVERDUE" : "required"} by {x.dueBy}</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "3px 0 8px" }}>Published by {x.by} on {x.at} ({x.id}). Reason: {x.reason}. A different admin/owner must approve within {svc.EMERGENCY_DAYS} business days.</div>
              <div className="btngrp">
                {btn("Approve retrospectively", "check", why, () => reasonModal(L, "Retrospective approval, " + x.id, { label: "Approval reason", min: 10, confirm: "Approve", run: async (r) => { await svc.decideException(id, x.id, "approve", r); return "Emergency change approved retrospectively"; } }), "btn-primary")}
                {btn("Reject", "x", why, () => reasonModal(L, "Reject emergency change, " + x.id, { label: "Reason", min: 10, confirm: "Reject", run: async (r) => { await svc.decideException(id, x.id, "reject", r); return "Emergency change rejected"; } }))}
              </div>
              <Why t={why} />
            </div></div>
          );
        })}
        {(p.exceptions as svc.PolicyException[]).filter((x) => x.status === "Rejected").map((x) => <p key={x.id} className="field help" style={{ color: "var(--bad-ink)" }}>Retrospective approval of v{x.ver} ({x.id}) was rejected by {x.decidedBy}. Publish a corrective revision.</p>)}

        <div className="rec-grid">
          <div className="rec-main">
            <div className="card"><div className="c-head"><h3>Progress</h3><span className="sub">{work ? `Working version v${work.ver}` : live ? `Published v${live.ver}` : "No version yet"}</span></div>
              <div className="c-body"><Stepper label="Version progress" steps={STEPS} current={step} /></div></div>

            <div className="card"><div className="c-head"><h3>Details</h3></div><div className="c-body">
              <dl className="meta-grid">
                <dt>Published version</dt><dd>{live ? `v${live.ver}${live.emergency ? " (emergency)" : ""}, effective ${live.effective || "n/a"}` : "None yet"}</dd>
                <dt>Working version</dt><dd>{work ? <>v{work.ver} <Chip cls={VER_TONE[work.status]}>{work.status}</Chip></> : "None"}</dd>
                <dt>Owner (creator)</dt><dd>{p.owner}</dd>
                <dt>Named approver</dt><dd>{work?.approver ? `${work.approver} (${work.approverRole})` : "Not named"}</dd>
                <dt>Next review</dt><dd>{p.review}</dd>
              </dl>
            </div></div>

            <div className="card"><div className="c-head"><h3>Workflow</h3></div><div className="c-body">
              {manager ? (
                <>
                  <div className="btngrp">
                    {btn(!work && live ? "New draft version" : "Edit", "team", editWhy, () => go(`/ws/policies/${encodeURIComponent(id)}/edit`), "btn-ghost")}
                    {btn("Submit for review", "ext", submitWhy, () => L.openModal("Submit for review", <SubmitForm id={id} L={L} />))}
                    {btn("Approve", "check", apprWhy, () => reasonModal(L, `Approve ${p.name} v${work?.ver}`, {
                      label: "Approval reason", min: 10, confirm: "Approve (immutable)",
                      extra: (set, v) => <div className="field"><label htmlFor="pol-eff">Effective date</label><input className="input" id="pol-eff" type="date" min={isoDay()} value={v.eff ?? isoDay()} onChange={(e) => set("eff", e.target.value)} /></div>,
                      run: async (r, v) => { await svc.approveVersion(id, { reason: r, effective: v.eff || isoDay() }); return "Approved: version is now immutable"; },
                    }), "btn-primary")}
                    {btn("Publish", "ext", pubWhy, () => run(() => svc.publishVersion(id), "Published"), "btn-primary")}
                    {btn("Request changes", "back", apprWhy, () => reasonModal(L, "Request changes", { label: "Remarks for the author", min: 10, confirm: "Return to draft", run: async (r) => { await svc.returnToDraft(id, r); return "Returned to draft"; } }))}
                    {work?.status === "In review" ? btn("Withdraw", "back", svc.isPolicyOwner(p) ? null : "Only the policy owner can withdraw.", () => reasonModal(L, "Withdraw from review", { label: "Reason", min: 10, confirm: "Withdraw", run: async (r) => { await svc.returnToDraft(id, r); return "Withdrawn to draft"; } }), "btn-ghost") : null}
                    {btn("Emergency publish", "alert", emWhy, () => reasonModal(L, "Emergency change", { label: "Emergency justification", min: 20, confirm: "Publish now (creates exception)", run: async (r) => { const x = await svc.emergencyPublish(id, r); return `Published. Retrospective approval due by ${x.dueBy}`; } }), "btn-danger")}
                    {btn("Reassign owner", "team", svc.whyCannotReassign(p), () => L.openModal("Reassign owner, " + p.id, <ReassignForm id={id} L={L} />), "btn-ghost")}
                  </div>
                  <Why t={editWhy || (work?.status === "In review" ? apprWhy : work?.status === "Approved" ? pubWhy : submitWhy)} />
                  <p className="field help" style={{ margin: "6px 0 0" }}>Only the creator edits content. Approval and publication are separate audited steps by the named approver, who is never the author or a last editor. Editing a published policy starts a new draft version; the published one stays immutable.</p>
                </>
              ) : <p className="field help" role="note">Read-only for your role. Employees read and acknowledge policies; auditors have read access.</p>}
            </div></div>

            <div className="card"><div className="c-head"><h3>Policy text</h3><span className="sub">{live ? `Published v${live.ver}` : work ? `Draft v${work.ver}, not published` : ""}</span></div><div className="c-body">
              {(live?.body || (manager ? work?.body : "")) ? <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55, maxWidth: "75ch" }}>{live?.body || work?.body}</div>
                : <p className="field help" style={{ margin: 0 }}>{live ? "No text has been written for this version." : "The text is shown here once the policy is published."}</p>}
            </div></div>
            <div className="card"><div className="c-head"><h3>Version history</h3><span className="sub">Immutable once approved</span></div><div className="c-body flush" style={{ padding: 0 }}>
              <Table cols={[{ t: "Version" }, { t: "State" }, { t: "Author / last editor" }, { t: "Approved by" }, { t: "Effective" }, { t: "Why" }]}>
                {p.versions.slice().reverse().map((v: svc.PolicyVersion, i: number) => (
                  <tr key={i}><td className="strong num">v{v.ver}</td><td><Chip cls={VER_TONE[v.status]}>{v.status}</Chip>{v.emergency ? <> <Chip cls="bad">Emergency</Chip></> : null}</td>
                    <td>{v.author}{!samePerson(v.author, v.lastEditor) ? ` / ${v.lastEditor}` : ""}</td><td>{v.approvedBy ? `${v.approvedBy}${v.approvedOnBehalfOf ? ` for ${v.approvedOnBehalfOf} (delegation)` : ""} on ${v.approvedAt}` : v.approver ? `Awaiting ${v.approver}` : "—"}</td><td>{v.effective || "—"}</td><td>{v.note}</td></tr>
                ))}
              </Table>
            </div></div>
          </div>

          <aside className="rec-side">
            <div className="card"><div className="c-head"><h3>Acceptance</h3></div><div className="c-body">
              {live ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <Ring pct={a.required ? Math.round((a.done / a.required) * 100) : 0} size={60} color="var(--accent)" />
                    <div><div style={{ fontWeight: 600 }}>{a.done} / {a.required} accepted</div><div style={{ fontSize: 12, color: "var(--muted)" }}>{API_ON ? `Active members who acknowledged v${live.ver}` : `Workforce acknowledgement of v${live.ver} (demo figures)`}</div></div>
                  </div>
                  <div className="btngrp">
                    {manager ? btn("Remind outstanding", "bell", null, () => remind(), "btn-ghost") : null}
                    <button className="btn btn-primary sm" disabled={!!myAck || !!canAckWhy} title={canAckWhy || undefined} onClick={() => run(async () => { const r = await acknowledge(me.name, id); if (!r) throw new Error("x"); wsLog("policy.acknowledged", `${p.id} v${live.ver} by ${me.name}`, "Policy"); }, "Acknowledged")}><Icon name="check" />{myAck ? "You acknowledged v" + live.ver : "Read & acknowledge"}</button>
                  </div>
                </>
              ) : <p className="field help">Acceptance tracking begins once the policy is published.</p>}
            </div></div>

            <div className="card"><div className="c-head"><h3>Mapped controls</h3></div><div className="c-body">
              <div className="btngrp" style={{ marginBottom: 8 }}>
                {p.mappedControls.length ? p.mappedControls.map((c: string, i: number) => <span key={i} className="tag num">{c}</span>) : <span style={{ color: "var(--muted)", fontSize: 13 }}>None mapped</span>}
              </div>
              {manager ? <button className="btn btn-ghost sm" onClick={() => openMapControl(L, id)}><Icon name="plus" />Map control</button> : null}
            </div></div>

            <div className="card"><div className="c-head"><h3>Change log</h3></div><div className="c-body"><Timeline label="Change log" items={log} /></div></div>
          </aside>
        </div>
      </div>
    </Page>
  );
}
