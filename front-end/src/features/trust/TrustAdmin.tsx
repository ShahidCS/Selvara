import { AIPanel, Chip, Icon, Page, StatusChip, Switch, Table, Empty } from "@/components/ui";
import { fmtDay, parseDay } from "@/lib/grcSod";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { DATA } from "@/lib/data";
import { API_ON } from "@/lib/rbac";
import { askReason } from "@/components/kit/ReasonDialog";
import { wsLog } from "@/lib/audit";
import { hasRole } from "@/lib/sod";
import { bumpData, useApp, useData, useModState } from "@/lib/store";
import { TRUST } from "@/lib/trustData";
import * as svc from "@/features/trust/services/trust";
import { ApprovalsPanel, WhyNot, attempt } from "@/components/kit/sodKit";
import { ApproveForm, BlockDomainForm, DenyForm, PublishForm } from "./TrustModals";
import { TRUST_SECTIONS, type TrustSection } from "@/lib/trustSections";
import { approvals } from "@/lib/approvals";
import { useSyncExternalStore } from "react";
import { g4Meta } from "@/services/ws";
import { useLayer } from "@/hooks/useLayer";

const TABS: [string, string][] = [["resources", "Resources"], ["access", "Access & requests"], ["activity", "Activity & history"], ["chat", "Chatbot"]];
const SEC = { margin: "0 0 8px" } as const;
/** Decision rows made in the session use ISO dates and full names; show them like the seeded rows ("22 Oct 2026", "J. Avery"). */
const dayText = (s: string) => { const d = parseDay(s); return d ? fmtDay(d) : s; };
const shortName = (s: string) => { const m = /^([A-Z])[a-z]+ (\S+)$/.exec(String(s ?? "").trim()); return m ? `${m[1]}. ${m[2]}` : s; };

/** Trust Center admin (source trustAdminView, lines 3369-3399). */
export default function TrustAdmin({ L, setPublic }: { L: LayerApi; setPublic: () => void }) {
  useData();
  const [tab, setTab] = useModState("trust.adm", "resources");
  const reqCount = TRUST.requests.length;
  const canAct = hasRole(useApp((s) => s.role), "admin", "owner");
  const noRole = canAct ? null : "Only admin or owner can do this.";

  /** The approver chooses which documents under NDA to share (none chosen is refused, here and on the server). */
  const approve = (id: string) => { if (TRUST.requests.some((x) => x.id === id)) L.openModal("Approve access request", <ApproveForm id={id} L={L} />); };
  const deny = (id: string) => { if (TRUST.requests.some((x) => x.id === id)) L.openModal("Deny access request", <DenyForm id={id} L={L} />); };
  const revoke = (i: number) => API_ON ? askReason(L, { title: "Revoke Trust Center access", label: "Reason", confirm: "Revoke access", danger: true, intro: `${TRUST.accounts[i]?.company}'s viewers lose access to private documents at once.`,
    run: async (why) => { await svc.revokeAccount(i, why); return `${TRUST.accounts[i]?.company ?? "Account"} access revoked`; } }) : attempt(L, async () => {
    const a = await svc.revokeAccount(i);
    if (!a) return;
    wsLog("trust.account.revoked", a.company, "Policy"); L.toast(a.company + " access revoked"); bumpData();
  });
  const unblock = (d: string) => API_ON ? askReason(L, { title: "Unblock " + d, label: "Reason", confirm: "Unblock", intro: "Someone else must approve requests from this domain afterwards.",
    run: async (why) => { await svc.unblockDomain(d, why); return d + " unblocked"; } }) : attempt(L, async () => { await svc.unblockDomain(d); wsLog("trust.domain.unblocked", d, "Policy"); L.toast(d + " unblocked"); bumpData(); });
  const toggleChatbot = () => attempt(L, async () => { const on = await svc.setChatbot(!TRUST.chatbot); wsLog("trust.chatbot." + (on ? "enabled" : "disabled"), "Trust Center chatbot", "Policy"); bumpData(); });
  const doToggleVis = (i: number) => attempt(L, async () => {
    const t = await svc.toggleVisibility(i);
    if (t.pending) { wsLog("trust.visibility.publish_requested", t.name, "Policy"); L.toast("Publishing " + t.name + " needs approval from a different admin or owner"); bumpData(); return; }
    wsLog("trust.visibility.changed", t.name + " → " + t.access, "Policy");
    L.toast(t.name + " is now access-controlled"); bumpData();
  });
  /** Making a resource private takes effect at once and making it public again needs a second approver, so ask first. */
  const toggleVis = (i: number) => DATA.trust[i]?.access !== "Public" ? doToggleVis(i) : askReason(L, { title: "Make " + DATA.trust[i].name + " private?", label: "", confirm: "Make private", danger: true,
    intro: "Visitors lose access to it at once. Making it public again needs approval from a different admin or owner.",
    run: async () => { const t = await svc.toggleVisibility(i); if (t.pending) { wsLog("trust.visibility.publish_requested", t.name, "Policy"); return "Publishing " + t.name + " needs approval from a different admin or owner"; } wsLog("trust.visibility.changed", t.name + " → " + t.access, "Policy"); return t.name + " is now access-controlled"; } });

  let body;
  if (tab === "resources") {
    body = (
      <>
      <ApprovalsPanel prefix="trust." title="Publishing approvals (four-eyes)" />
      <SectionsCard canAct={canAct} noRole={noRole} preview={setPublic} />
      <div className="panels" data-tour="trust-resources" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gridAutoRows: "min-content", alignContent: "start" }}>
        {DATA.trust.map((t, i) => (
          <div className="card" key={i}><div className="c-body">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}><div style={{ fontWeight: 600 }}>{t.name}</div><StatusChip s={t.status} /></div>
            <div style={{ fontSize: ".78125rem", color: "var(--muted)", marginTop: 8 }}><Icon name={t.access === "Public" ? "check" : "access"} /> {t.access}{API_ON && t.file ? ` · ${t.file.name}` : ""}</div>
            <div className="btngrp" style={{ marginTop: 12 }}>
              {API_ON ? <>
                <button className="btn btn-secondary sm" disabled={!t.file} title={t.file ? undefined : "No file attached yet"} onClick={() => attempt(L, async () => { const { url } = await svc.resourceLink(i); window.open(url, "_blank", "noopener"); })}><Icon name="ext" />View</button>
                {canAct ? <label className="btn btn-ghost sm" style={{ cursor: "pointer" }}><Icon name="plus" />{t.file ? "Replace file" : "Attach file"}
                  <input type="file" style={{ display: "none" }} aria-label={"Attach file to " + t.name} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) attempt(L, async () => { await svc.uploadResourceFile(i, f); L.toast("File attached to " + t.name); bumpData(); }); }} /></label> : null}
              </> : <button className="btn btn-secondary sm" onClick={() => L.toast("Opened " + t.name + " (demo)")}><Icon name="ext" />View</button>}
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
                  <td>{r.who}{svc.isBlockedWho(r.who) ? <> <span className="chip bad" style={{ marginLeft: 4 }}><Icon name="alert" />Blocked domain</span></> : null}<div style={{ fontSize: ".71875rem", color: "var(--muted)" }}>{r.company} · {r.at}</div></td>
                  <td>{r.resource}</td><td style={{ fontSize: ".75rem", color: "var(--muted)" }}>{r.reason}</td>
                  <td className="r">
                    {(() => { const why = svc.approveBlockReason(r); return (<><div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>
                      <button className="btn btn-ghost sm" disabled={!!why} aria-describedby={why ? "tra-" + r.id : undefined} onClick={() => approve(r.id)}><Icon name="check" />Approve</button>
                      <button className="btn btn-ghost sm" disabled={!canAct} title={noRole || undefined} onClick={() => deny(r.id)}><Icon name="x" />Deny</button></div>
                      <WhyNot id={"tra-" + r.id} text={why} />
                    </>); })()}
                  </td>
                </tr>
              ))}
            </Table>
          ) : <div className="empty" style={{ padding: 22 }}><div className="ei"><Icon name="check" /></div><h4>No requests waiting</h4></div>}
        </section>
        <section><div className="sectitle" style={SEC}>Customer trust accounts &amp; viewers with access</div>
          <p className="field help" style={{ margin: "0 0 8px" }}>Each viewer accepts the NDA for themselves; one person&rsquo;s acceptance never covers a colleague.</p>
          <Table cols={[{ t: "Account" }, { t: "Viewers and their NDA" }, { t: "Access to" }, { t: "Status" }, { t: "" }]}>
            {TRUST.accounts.map((a, i) => (
              <tr key={i}>
                <td className="strong">{a.company}<div style={{ fontSize: ".71875rem", color: "var(--muted)" }}>{a.domain}</div></td>
                <td style={{ fontSize: ".75rem" }}>{a.viewers.length ? (a.people ?? a.viewers.map((email) => ({ email, nda: "Pending" }))).map((v, j) => (
                  <div key={j} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", padding: "2px 0" }}>{v.email}
                    {v.nda.startsWith("Accepted") ? <Chip cls="ok" icon="check">NDA {v.nda.toLowerCase()}</Chip> : <Chip cls="warn" icon="clock">NDA pending</Chip>}</div>
                )) : <span style={{ color: "var(--muted)" }}>None yet</span>}</td>
                <td style={{ fontSize: ".75rem" }}>{Array.isArray(a.access) ? a.access.join(", ") || "—" : a.access}</td><td><StatusChip s={a.status} /></td>
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
                    <td style={{ fontSize: ".75rem", color: "var(--muted)", whiteSpace: "nowrap" }}>{dayText(d.at)}</td><td style={{ fontSize: ".75rem" }}>{d.who}</td><td style={{ fontSize: ".75rem" }}>{d.resource}</td>
                    <td>{d.decision === "Approved" ? <Chip cls="ok" icon="check">Approved</Chip> : <Chip cls="bad" icon="x">Denied</Chip>}</td>
                    <td style={{ fontSize: ".75rem" }}>{shortName(d.by)}</td><td style={{ fontSize: ".71875rem", color: "var(--muted)" }}>{d.note || "—"}</td>
                  </tr>
                ))}
              </Table>
            ) : <Empty compact icon="check" title="No decisions recorded yet" />}
          </section>
          <section><div className="sectitle" style={SEC}>Blocked domains</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {TRUST.blocked.length ? TRUST.blocked.map((d) => (
                <span className="chip neutral" key={d} style={{ paddingRight: 2 }}>{d} <button type="button" className="btn btn-ghost sm" onClick={() => unblock(d)} aria-label={"Unblock " + d} title={"Unblock " + d} disabled={!canAct}
                  style={{ minWidth: 24, minHeight: 24, width: 24, height: 24, padding: 0, justifyContent: "center" }}><Icon name="x" aria-hidden="true" /></button></span>
              )) : <span style={{ fontSize: ".78125rem", color: "var(--muted)" }}>No blocked domains.</span>}
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
            {TRUST.activity.map((a, i) => <tr key={i}><td style={{ fontSize: ".75rem", color: "var(--muted)", whiteSpace: "nowrap" }}>{a.at}</td><td className="strong" style={{ fontSize: ".78125rem" }}>{a.who}</td><td>{a.what}</td></tr>)}
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
          <div className="c-body" style={{ padding: "12px 14px" }} title={noRole || undefined}>
            <Switch id="trust-chatbot" label="Trust Center chatbot" hint="Answers visitor questions from your published FAQ and verified answer library only." checked={!!TRUST.chatbot} disabled={!canAct} onChange={() => toggleChatbot()} />
          </div>
        </div>
        {API_ON ? <PublicPageCard canAct={canAct} noRole={noRole} /> : null}
        <div className="sectitle" style={SEC}>Conversation log</div>
        {TRUST.chats.length ? TRUST.chats.map((c, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: ".75rem", color: "var(--muted)", marginBottom: 4 }}>{dayText(c.at)} · visitor ({c.who})</div>
            <div style={{ fontWeight: 500, marginBottom: 6 }}>{c.q}</div>
            <AIPanel source="Trust Center chatbot" label={"Chatbot answer to: " + c.q}><p style={{ margin: "6px 0 0", fontSize: ".8125rem", color: "var(--ink-2)" }}>{c.a}</p></AIPanel>
          </div>
        )) : <Empty compact icon="message" title="No conversations yet" />}
      </div>
    );
  }

  return (
    <Page mod="trust" acts={<>
      <button className="btn btn-secondary" data-tour="trust-preview" onClick={setPublic}><Icon name="eye" />Preview public page</button>
      {tab === "resources" ? <button className="btn btn-primary" data-tour="trust-publish" disabled={!canAct} title={noRole || undefined} onClick={() => L.openModal("Publish resource", <PublishForm L={L} />)}><Icon name="plus" />Publish resource</button> : null}
    </>}>
      <div className="card" style={{ flex: "0 1 auto", minHeight: 0 }}>
        <div className="c-head"><div className="tabs" role="tablist" aria-label="Trust Center admin" data-tour="trust-tabs">{TABS.map((t) => (
          <button key={t[0]} type="button" className="tab" role="tab" aria-selected={tab === t[0]} onClick={() => setTab(t[0])}>{t[1]}{t[0] === "access" && reqCount ? <> <span className="tag" style={{ marginLeft: 4 }}>{reqCount}</span></> : null}</button>
        ))}</div></div>
        <div className="c-body scroll" id="trustAdmBody">{body}</div>
      </div>
    </Page>
  );
}

/** Production (group 8b): the anonymous public page at /trust/<company code>. */
function PublicPageCard({ canAct, noRole }: { canAct: boolean; noRole?: string | null }) {
  const L = useLayer();
  const pg = useSyncExternalStore(g4Meta.subscribe, () => g4Meta.get().trustPage, () => g4Meta.get().trustPage);
  if (!pg) return null;
  const url = typeof window !== "undefined" && pg.ref ? `${window.location.origin}/trust/${pg.ref}` : "";
  const toggle = () => attempt(L, async () => { const r = await svc.setPublicPage(!pg.on); L.toast(r.pending ? "Turning the public page on needs a different admin or owner to approve" : r.on ? "Public page on" : "Public page turned off"); bumpData(); });
  return (
    <div className="card" style={{ boxShadow: "none", background: "var(--surface-2)", borderColor: "transparent", marginBottom: 12 }}>
      <div className="c-body" style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px" }}>
          <div style={{ fontWeight: 600 }}>Public page for visitors without an account</div>
          <div style={{ fontSize: ".78125rem", color: "var(--muted)" }}>{pg.on ? <>On since {pg.since} (approved by {pg.by}): <a href={url} target="_blank" rel="noopener noreferrer">{url}</a></> : pg.pending ? "Turning it on is waiting for a second admin or owner (Approvals)." : "Off. When on, anyone can see the sections you publish (What visitors can see, on the Resources tab)."}
            {" The address uses your company code, which is also what people type to ask to join your workspace; a join request always needs an admin's approval."}
            {!pg.mail ? " Email is not set up for the platform, so visitors cannot verify an address to request documents or subscribe." : " Visitors confirm a work email with a code before they request a document, accept the NDA or subscribe."}</div>
        </div>
        <button className={`btn ${pg.on ? "btn-secondary" : "btn-primary"} sm`} disabled={!canAct || (!pg.on && !!pg.pending)} title={noRole || undefined} onClick={toggle}>{pg.on ? "Turn off" : "Ask to turn on"}</button>
      </div>
    </div>
  );
}

/** What visitors can see (security fix F1-02): the company publishes each section of its Trust Center or not, for the anonymous page and
 *  for customers and vendors in the workspace. Showing the live control status needs a different admin or owner; anything else, and
 *  hiding it, applies at once. The server enforces it and leaves a hidden section out of what it sends. */
function SectionsCard({ canAct, noRole, preview }: { canAct: boolean; noRole?: string | null; preview: () => void }) {
  const L = useLayer(); useData(); useSyncExternalStore(approvals.subscribe, approvals.get, approvals.get);
  const prodPending = useSyncExternalStore(g4Meta.subscribe, () => g4Meta.get().trustSectionsPending ?? null, () => null);
  const pending = API_ON ? prodPending : svc.sectionsPendingDemo();
  const flip = (k: TrustSection, on: boolean) => attempt(L, async () => {
    const r = await svc.setSection(k, on); const label = TRUST_SECTIONS.find((x) => x.key === k)!.label;
    if (r.pending) { wsLog("trust.section.requested", `${label} → shown`, "Policy"); L.toast("Showing the live control status needs approval from a different admin or owner"); bumpData(); return; }
    wsLog("trust.section.changed", `${label} → ${on ? "shown" : "hidden"}`, "Policy"); L.toast(`${label} ${on ? "shown to" : "hidden from"} visitors`); bumpData();
  });
  return (
    <section className="card" aria-labelledby="trust-sections-h" style={{ marginBottom: 12 }}>
      <div className="c-head"><h3 id="trust-sections-h">What visitors can see</h3></div>
      <div className="c-body" title={noRole || undefined}>
        <p className="field help" style={{ margin: "0 0 8px" }}>Applies to the public page and to customers and vendors in the workspace. A hidden section is not sent to them at all. Documents under NDA are never named to anyone they were not shared with.</p>
        {TRUST_SECTIONS.map((s) => {
          const waiting = s.key === "controls" && !TRUST.sections.controls && !!pending;
          return <Switch key={s.key} id={`trust-sec-${s.key}`} label={s.label} hint={waiting ? "Waiting for a different admin or owner to approve (Publishing approvals)." : s.hint} checked={!!TRUST.sections[s.key]} disabled={!canAct || waiting} onChange={(on) => flip(s.key, on)} />;
        })}
        <button className="btn btn-ghost sm" style={{ marginTop: 6 }} onClick={preview}><Icon name="eye" />See the result in the preview</button>
      </div>
    </section>
  );
}
