import { Chip, Icon, StatusChip, Table } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { sodMessage } from "@/lib/approvalFlow";
import { sodReason } from "@/lib/sod";
import { bumpData } from "@/lib/store";
import { ACCESS_REVIEWS } from "@/lib/requests";
import * as svc from "@/services/access";

export function AccessReviews({ canAct }: { canAct: boolean }) {
  const L = useLayer();
  const decide = async (rid: string, ai: number, d: svc.ReviewDecision) => {
    try {
      const r = await svc.decideReviewAccount(rid, ai, d);
      if (!r) { L.toast("This review item can no longer be changed", false); bumpData(); return; }
      bumpData();
    } catch (e) { L.toast(sodMessage(e, "Could not record the decision"), false); }
  };
  const complete = async (rid: string) => {
    try {
      const r = await svc.completeReview(rid);
      if (!r) { L.toast("This review cannot be completed yet", false); bumpData(); return; }
      L.toast("Review completed, " + r.revoked + " of " + r.revocations + " revocation(s) applied"); bumpData();
    } catch (e) { L.toast(sodMessage(e, "Could not complete the review"), false); }
  };
  const block = (rv: { accounts: { level: string }[] }) => (svc.reviewHasPrivileged(rv) ? sodReason("a review with privileged accounts must be completed by someone other than its creator", svc.reviewCreator(rv)) : null);
  return (
    <div style={{ padding: 12 }}>
      {ACCESS_REVIEWS.map((rv, i) => {
        const decided = rv.accounts.filter((a: { decision: string }) => a.decision).length;
        return (
          <div className="card" style={{ boxShadow: "none", marginBottom: 12 }} key={rv.id + i}>
            <div className="c-head">
              <div><h3 style={{ margin: 0 }}>{rv.name}</h3><div className="sub">{rv.scope} · created by {svc.reviewCreator(rv)}</div></div>
              <div className="r"><StatusChip s={rv.status === "Open" ? "In progress" : "Completed"} /> <span className="tag" style={{ marginLeft: 6 }}>{decided}/{rv.accounts.length} reviewed</span></div>
            </div>
            <div className="c-body" style={{ padding: 0 }}>
              <Table cols={[{ t: "User" }, { t: "System" }, { t: "Level" }, { t: "Decision" }]}>
                {rv.accounts.map((a: { user: string; system: string; level: string; decision: string; revoked?: boolean }, ai: number) => (
                  <tr key={a.user + a.system + ai}>
                    <td className="strong">{a.user}</td><td>{a.system}</td><td>{a.level}</td>
                    <td>{a.decision ? <>{a.decision === "Keep" ? <Chip cls="ok" icon="check">Kept</Chip> : <Chip cls="bad" icon="x">{a.revoked ? "Revoked" : "To revoke"}</Chip>}{a.decision !== "Keep" && !a.revoked && rv.status === "Open" ? <span style={{ fontSize: ".6875rem", color: "var(--muted)", marginLeft: 6 }}>applied when the review completes</span> : null}</> : canAct ? (() => {
                      const own = sodReason("you cannot decide on your own access", a.user);
                      return own ? <span style={{ fontSize: ".75rem", color: "var(--muted)", display: "inline-flex", gap: 5, alignItems: "center" }}><Icon name="alert" />You cannot decide on your own access</span> : (
                        <div className="btngrp">
                          <button className="btn btn-ghost sm" aria-label={`Keep ${a.user} on ${a.system}`} onClick={() => decide(rv.id, ai, "Keep")}><Icon name="check" />Keep</button>
                          <button className="btn btn-ghost sm" style={{ color: "var(--bad-ink)" }} aria-label={`Revoke ${a.user} on ${a.system}`} onClick={() => decide(rv.id, ai, "Revoke")}><Icon name="x" />Revoke</button>
                        </div>
                      );
                    })() : <span style={{ color: "var(--muted)", fontSize: ".75rem" }}>Read-only</span>}</td>
                  </tr>
                ))}
              </Table>
            </div>
            {canAct && decided === rv.accounts.length && rv.status === "Open" ? (
              <div className="c-body" style={{ padding: 10 }}><button className="btn btn-primary sm" disabled={!!block(rv)} title={block(rv) || undefined} onClick={() => complete(rv.id)}><Icon name="check" />Complete review</button></div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
