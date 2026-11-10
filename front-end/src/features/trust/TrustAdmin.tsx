import { Chip, Icon, Page, StatusChip, Table } from "@/components/ui";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { DATA } from "@/lib/data";
import { wsLog } from "@/lib/audit";
import { hasRole } from "@/lib/sod";
import { bumpData, useApp, useData, useModState } from "@/lib/store";
import { TRUST } from "@/lib/trustData";
import * as svc from "@/services/trust";
import { ApprovalsPanel, WhyNot, attempt } from "@/components/kit/sodKit";
import { BlockDomainForm, DenyForm, PublishForm } from "./TrustModals";

const TABS: [string, string][] = [["resources", "Resources"], ["access", "Access & requests"], ["activity", "Activity & history"], ["chat", "Chatbot"]];
const SEC = { margin: "0 0 8px" } as const;

/** Trust Center admin (source trustAdminView, lines 3369-3399). */
export default function TrustAdmin({ L, setPublic }: { L: LayerApi; setPublic: () => void }) {
  useData();
  const [tab, setTab] = useModState("trust.adm", "resources");
  const reqCount = TRUST.requests.length;
  const canAct = hasRole(useApp((s) => s.role), "admin", "owner");
  const noRole = canAct ? null : "Only admin or owner can do this.";

  const approve = (id: string) => attempt(L, async () => {
    const r = await svc.approveRequest(id);
    if (!r) return;
    wsLog("trust.access.approved", r.who + " → " + r.resource, "Policy");
    L.toast("Access approved for " + r.who); bumpData();
  });
  const deny = (id: string) => { if (TRUST.requests.some((x) => x.id === id)) L.openModal("Deny access request", <DenyForm id={id} L={L} />); };
  const revoke = (i: number) => attempt(L, async () => {
    const a = await svc.revokeAccount(i);
    if (!a) return;
    wsLog("trust.account.revoked", a.company, "Policy"); L.toast(a.company + " access revoked"); bumpData();
  });
  const unblock = (d: string) => attempt(L, async () => { await svc.unblockDomain(d); wsLog("trust.domain.unblocked", d, "Policy"); L.toast(d + " unblocked"); bumpData(); });
  const toggleChatbot = () => attempt(L, async () => { const on = await svc.setChatbot(!TRUST.chatbot); wsLog("trust.chatbot." + (on ? "enabled" : "disabled"), "Trust Center chatbot", "Policy"); bumpData(); });
  const toggleVis = (i: number) => attempt(L, async () => {
    const t = await svc.toggleVisibility(i);
    if (t.pending) { wsLog("trust.visibility.publish_requested", t.name, "Policy"); L.toast("Publishing " + t.name + " needs approval from a different admin or owner"); bumpData(); return; }
    wsLog("trust.visibility.changed", t.name + " → " + t.access, "Policy");
    L.toast(t.name + " is now access-controlled"); bumpData();
  });

  let body;
  if (tab === "resources") {
    body = (
      <>
      <ApprovalsPanel prefix="trust." title="Publishing approvals (four-eyes)" />
      <div className="panels" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gridAutoRows: "min-content", alignContent: "start" }}>
        {DATA.trust.map((t, i) => (
          <div className="card" key={i}><div className="c-body">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}><div style={{ fontWeight: 600 }}>{t.name}</div><StatusChip s={t.status} /></div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8 }}><Icon name={t.access === "Public" ? "check" : "access"} /> {t.access}</div>
            <div className="btngrp" style={{ marginTop: 12 }}>
              <button className="btn btn-secondary sm" onClick={() => L.toast("Opened " + t.name + " (demo)")}><Icon name="ext" />View</button>
              <button className="btn btn-ghost sm" disabled={!canAct || !!t.publishPending} title={noRole || undefined} onClick={() => toggleVis(i)}>{t.access === "Public" ? "Make private" : t.publishPending ? "Awaiting approval" : "Request to make public"}</button>
            </div>
          </div></div>
        ))}
      </div>
      </>
    );
  } else if (tab === "access") {
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <section><div className="sectitle" style={SEC}>Pending access requests</div>
          {reqCount ? (
            <Table cols={[{ t: "Request" }, { t: "Requester" }, { t: "Resource" }, { t: "Reason" }, { t: "" }]}>
              {TRUST.requests.map((r) => (
                <tr key={r.id}>
                  <td className="strong num">{r.id}</td>
                  <td>{r.who}{svc.isBlockedWho(r.who) ? <> <span className="chip bad" style={{ marginLeft: 4 }}><Icon name="alert" />Blocked domain</span></> : null}<div style={{ fontSize: 11.5, color: "var(--muted)" }}>{r.company} · {r.at}</div></td>
                  <td>{r.resource}</td><td style={{ fontSize: 12, color: "var(--muted)" }}>{r.reason}</td>
                  <td className="r" style={{ whiteSpace: "nowrap" }}>
                    {(() => { const why = svc.approveBlockReason(r); return (<>
                      <button className="btn btn-ghost sm" disabled={!!why} aria-describedby={why ? "tra-" + r.id : undefined} onClick={() => approve(r.id)}><Icon name="check" />Approve</button>
                      <button className="btn btn-ghost sm" disabled={!canAct} title={noRole || undefined} onClick={() => deny(r.id)}>Deny</button>
                      <WhyNot id={"tra-" + r.id} text={why} />
                    </>); })()}
                  </td>
                </tr>
              ))}
            </Table>
          ) : <div className="empty" style={{ padding: 22 }}><div className="ei"><Icon name="check" /></div><h4>No requests waiting</h4></div>}
        </section>
        <section><div className="sectitle" style={SEC}>Customer trust accounts &amp; viewers with access</div>
          <Table cols={[{ t: "Account" }, { t: "NDA" }, { t: "Viewers" }, { t: "Access to" }, { t: "Status" }, { t: "" }]}>
            {TRUST.accounts.map((a, i) => (
              <tr key={i}>
                <td className="strong">{a.company}<div style={{ fontSize: 11.5, color: "var(--muted)" }}>{a.domain}</div></td>
                <td style={{ fontSize: 12 }}>{a.nda === "Pending" ? <Chip cls="warn" icon="clock">Pending</Chip> : <Chip cls="ok" icon="check">{a.nda}</Chip>}</td>
                <td style={{ fontSize: 12 }}>{a.viewers.length ? a.viewers.map((v, j) => <span key={j}>{j ? <br /> : null}{v}</span>) : <span style={{ color: "var(--muted)" }}>None yet</span>}</td>
                <td style={{ fontSize: 12 }}>{a.access}</td><td><StatusChip s={a.status} /></td>
                <td className="r">{a.status === "Active" ? <button className="btn btn-ghost sm" disabled={!canAct} title={noRole || undefined} onClick={() => revoke(i)}>Revoke</button> : null}</td>
              </tr>
            ))}
          </Table>
        </section>
        <div className="split" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
          <section><div className="sectitle" style={SEC}>Decision history</div>
            {TRUST.decisions.length ? (
              <Table cols={[{ t: "When" }, { t: "Requester" }, { t: "Resource" }, { t: "Decision" }, { t: "By" }, { t: "Note" }]}>
                {TRUST.decisions.map((d, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{d.at}</td><td style={{ fontSize: 12 }}>{d.who}</td><td style={{ fontSize: 12 }}>{d.resource}</td>
                    <td>{d.decision === "Approved" ? <Chip cls="ok" icon="check">Approved</Chip> : <Chip cls="bad" icon="x">Denied</Chip>}</td>
                    <td style={{ fontSize: 12 }}>{d.by}</td><td style={{ fontSize: 11.5, color: "var(--muted)" }}>{d.note || "—"}</td>
                  </tr>
                ))}
              </Table>
            ) : <p className="field help" style={{ margin: 0 }}>No decisions recorded yet.</p>}
          </section>
          <section><div className="sectitle" style={SEC}>Blocked domains</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {TRUST.blocked.length ? TRUST.blocked.map((d) => (
                <span className="chip neutral" key={d}>{d} <button onClick={() => unblock(d)} aria-label={"Unblock " + d} style={{ appearance: "none", border: 0, background: "none", color: "var(--muted)", cursor: "pointer", padding: "0 0 0 4px" }}>×</button></span>
              )) : <span style={{ fontSize: 12.5, color: "var(--muted)" }}>No blocked domains.</span>}
            </div>
            <button className="btn btn-secondary sm" disabled={!canAct} title={noRole || undefined} onClick={() => L.openModal("Block a domain", <BlockDomainForm L={L} />)}><Icon name="plus" />Block a domain</button>
          </section>
        </div>
      </div>
    );
  } else if (tab === "activity") {
    body = (
      <div className="split" style={{ gridTemplateColumns: "1.3fr 1fr" }}>
        <section><div className="sectitle" style={SEC}>Recent viewer activity</div>
          <Table cols={[{ t: "When" }, { t: "Viewer" }, { t: "Activity" }]}>
            {TRUST.activity.map((a, i) => <tr key={i}><td style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{a.at}</td><td className="strong" style={{ fontSize: 12.5 }}>{a.who}</td><td>{a.what}</td></tr>)}
          </Table>
        </section>
        <section><div className="sectitle" style={SEC}>Public-page change history</div>
          <div className="feed">{TRUST.modeHist.map((h, i) => (
            <div className="feed-item" key={i}><span className="dot" style={{ marginTop: 5, background: "var(--accent)" }}></span><div className="fi"><div className="ft">{h.change}</div><div className="fm">{h.at} · {h.who}</div></div></div>
          ))}</div>
        </section>
      </div>
    );
  } else {
    body = (
      <div style={{ maxWidth: 760 }}>
        <div className="card" style={{ boxShadow: "none", background: "var(--accent-weak)", borderColor: "transparent", marginBottom: 12 }}>
          <div className="c-body" style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
            <div style={{ flex: "1 1 auto" }}><div style={{ fontWeight: 600 }}>Trust Center chatbot</div><div style={{ fontSize: 12.5, color: "var(--muted)" }}>Answers visitor questions from your published FAQ and verified answer library only. {TRUST.chatbot ? "Currently on." : "Currently off."}</div></div>
            <button className={`btn ${TRUST.chatbot ? "btn-secondary" : "btn-primary"} sm`} disabled={!canAct} title={noRole || undefined} onClick={toggleChatbot}>{TRUST.chatbot ? "Turn off" : "Turn on"}</button>
          </div>
        </div>
        <div className="sectitle" style={SEC}>Conversation log</div>
        {TRUST.chats.length ? TRUST.chats.map((c, i) => (
          <div className="card" key={i} style={{ boxShadow: "none", background: "var(--surface-2)", marginBottom: 8 }}><div className="c-body" style={{ padding: "11px 13px" }}>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>{c.at} · visitor ({c.who})</div>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>{c.q}</div>
            <div style={{ fontSize: 13, color: "var(--ink-2)" }}><Icon name="assistant" /> {c.a}</div>
          </div></div>
        )) : <p className="field help">No conversations yet.</p>}
      </div>
    );
  }

  return (
    <Page mod="trust" acts={<>
      <button className="btn btn-secondary" onClick={setPublic}><Icon name="ext" />Preview public page</button>
      {tab === "resources" ? <button className="btn btn-primary" disabled={!canAct} title={noRole || undefined} onClick={() => L.openModal("Publish resource", <PublishForm L={L} />)}><Icon name="plus" />Publish resource</button> : null}
    </>}>
      <div className="card" style={{ flex: "0 1 auto", minHeight: 0 }}>
        <div className="c-head"><div className="seg" role="tablist">{TABS.map((t) => (
          <button key={t[0]} role="tab" aria-selected={tab === t[0]} onClick={() => setTab(t[0])}>{t[1]}{t[0] === "access" && reqCount ? <> <span className="tag" style={{ marginLeft: 4 }}>{reqCount}</span></> : null}</button>
        ))}</div></div>
        <div className="c-body scroll" id="trustAdmBody">{body}</div>
      </div>
    </Page>
  );
}
