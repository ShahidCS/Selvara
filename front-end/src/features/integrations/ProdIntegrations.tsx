/* Production Integrations (programme group 7): the read-only connectors the platform offers (GitHub, AWS, Okta, Microsoft Entra ID, Google
   Workspace), the company's connections, what each one checks and the accounts it saw. Setting up shows the steps for the provider's side
   with the values Selvara generated for this company (AWS external id, Okta public key); connecting is tested, then approved by a second
   admin. The server enforces every rule; these screens explain and ask. */
import { useEffect, useRef, useState } from "react";
import { Chip, DataTable, Empty, Icon, KpiStrip, KpiTile, Page, type DTColumn } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { DATA } from "@/lib/data";
import { useG7, type G7Provider } from "@/lib/g7";
import { useData } from "@/lib/store";
import { useGo } from "@/lib/route";
import { uiMessage } from "@/lib/grcSod";
import { ApprovalsPanel, attempt } from "@/components/kit/sodKit";
import { askReason } from "@/components/kit/ReasonDialog";
import * as svc from "@/features/integrations/services/integrations";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Conn = any;
const LIST = "/ws/integrations";
export const HealthOf = ({ c }: { c: Conn }) => (c.status !== "Connected" ? (c.status === "Pending approval" ? <Chip cls="warn" icon="clock">Pending approval</Chip> : c.status === "Disconnected" ? <Chip cls="neutral" icon="dot">Disconnected</Chip> : c.status === "Not approved" ? <Chip cls="neutral" icon="x">Not approved</Chip> : <Chip cls="info" icon="edit">Setting up</Chip>)
  : c.health === "Healthy" ? <Chip cls="ok" icon="check">Healthy</Chip> : c.health === "Degraded" ? <Chip cls="warn" icon="alert">Some checks need data</Chip> : c.health === "Never synced" ? <Chip cls="neutral" icon="clock">Not synced yet</Chip> : <Chip cls="bad" icon="x">{c.health}</Chip>);
const ResultChip = ({ r }: { r: string }) => (r === "Pass" ? <Chip cls="ok" icon="check">Pass</Chip> : r === "Fail" ? <Chip cls="bad" icon="x">Fail</Chip> : <Chip cls="neutral" icon="dot">Needs data</Chip>);

export function ProdIntegrations({ id }: { id: string | null }) { return id === "callback" ? <CallbackPage /> : id ? <ConnectionPage id={id} /> : <ConnectionList />; }

/** Where GitHub, Microsoft and Google send the admin back after the sign-in that binds their organisation. */
function CallbackPage() {
  const go = useGo(); const done = useRef(false);
  const q = () => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const [msg, setMsg] = useState(() => {
    const p = q();
    if (p.get("error")) return `The provider did not complete the sign-in: ${(p.get("error_description") ?? p.get("error") ?? "").slice(0, 200)}`;
    if (p.get("admin_consent")) return "Consent was granted. Open the connection and select Test and request approval.";
    if (!p.get("code") || !p.get("state")) return p.get("installation_id") ? "The Selvara GitHub App is installed. Open the connection and select Sign in with GitHub." : "Nothing to do here.";
    return "Checking the sign-in…";
  });
  useEffect(() => {
    const p = q(); const code = p.get("code") ?? ""; const state = p.get("state") ?? "";
    if (done.current || p.get("error") || !code || !state) return; done.current = true;
    svc.verifyCallback({ code, state, installationId: p.get("installation_id") ?? undefined })
      .then((r) => go(`${LIST}/${encodeURIComponent(r.id)}${r.preselect ? `?installation=${encodeURIComponent(r.preselect)}` : ""}`))
      .catch((e) => setMsg(uiMessage(e)));
  }, [go]);
  return <Page title="Connecting" back={{ href: LIST, label: "Integrations" }}><div className="card"><div className="c-body" role="status">{msg}</div></div></Page>;
}

function ConnectionList() {
  useData(); const L = useLayer(); const go = useGo(); const { providers, connections, runs } = useG7();
  const ran = useRef(false);
  useEffect(() => { // a connection not synced for a day syncs when an admin opens the page (there is no scheduler)
    if (ran.current || !connections.some((c: Conn) => c.due)) return; ran.current = true;
    svc.syncDueConnections().catch(() => undefined);
  }, [connections]);
  const live = connections.filter((c: Conn) => c.status === "Connected");
  const checks = live.flatMap((c: Conn) => c.checks);
  const start = (p: G7Provider) => attempt(L, async () => { const r = await svc.startConnection(p.id); go(`${LIST}/${encodeURIComponent(r.id)}`); });
  const syncAll = () => attempt(L, async () => { const r = await svc.syncAllConnections(); L.toast(r.of ? `${r.synced} of ${r.of} synced` : "Nothing to sync: every connection synced in the last 5 minutes"); });
  const cols: DTColumn<Conn>[] = [
    { key: "label", header: "Connection", value: (c) => c.label, locked: true, render: (c) => <span className="strong">{c.label}<div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 400 }}>{c.name} · {c.type}</div></span> },
    { key: "status", header: "Status", value: (c) => `${c.status} ${c.health}`, render: (c) => <HealthOf c={c} /> },
    { key: "checks", header: "Checks", value: (c) => c.checks.length, render: (c) => (c.checks.length ? <span className="num">{c.checks.filter((x: Conn) => x.result === "Pass").length} pass · {c.checks.filter((x: Conn) => x.result === "Fail").length} fail</span> : <span style={{ color: "var(--faint)" }}>—</span>) },
    { key: "last", header: "Last sync", value: (c) => c.lastSync, render: (c) => <span style={{ color: "var(--muted)" }}>{c.lastSync}</span> },
    { key: "act", header: "Actions", hideHeader: true, align: "end", locked: true, render: () => <Icon name="chevron" /> },
  ];
  return (
    <Page mod="integrations" acts={live.length ? <button className="btn btn-secondary" onClick={syncAll}><Icon name="refresh" />Sync all</button> : undefined}>
      <div className="scroll" style={{ flex: "1 1 auto" }}><div style={{ display: "flex", flexDirection: "column", gap: 14, paddingRight: 2 }}>
        <KpiStrip label="Integration summary">
          <KpiTile label="Connected" value={live.length} caption={`of ${providers.length} connectors`} />
          <KpiTile label="Needing attention" value={live.filter((c: Conn) => c.health !== "Healthy").length} delta={live.some((c: Conn) => c.health !== "Healthy") ? { tone: "watch", text: "Check health" } : { tone: "good", text: "All healthy" }} caption="Connections" />
          <KpiTile label="Automated checks failing" value={checks.filter((x: Conn) => x.result === "Fail").length} caption={`of ${checks.length} checks`} />
          <KpiTile label="Access" value="Read-only" delta={{ tone: "good", text: "Least privilege" }} caption="Nothing is written back" />
        </KpiStrip>
        <ApprovalsPanel prefix="integration." title="Connection approvals (second admin)" />
        <div className="card"><div className="c-head"><h3>Connectors</h3></div><div className="c-body" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
          {providers.map((p) => (
            <div key={p.id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="strong">{p.name}</span><span className="tag">{p.type}</span></div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.45, flex: "1 1 auto" }}>{p.scope}</div>
              {p.ready ? <p className="field help" style={{ margin: 0 }}>{p.ready}</p>
                : p.active && p.id !== "aws" ? <Chip cls="ok" icon="check">Set up</Chip>
                : <button className="btn btn-secondary sm" style={{ alignSelf: "flex-start" }} aria-label={p.id === "aws" && p.active ? "Add another AWS account" : `Set up ${p.name}`} onClick={() => start(p)}><Icon name="plus" />{p.id === "aws" && p.active ? "Add another AWS account" : "Set up"}</button>}
            </div>
          ))}
        </div></div>
        <div className="card"><div className="c-head"><h3>Your connections</h3></div><div className="c-body flush" style={{ padding: 0 }}>
          {connections.length ? <DataTable<Conn> id="integration-connections" label="Connections" rows={connections} rowKey={(c) => c.id} columns={cols} searchText={(c) => `${c.label} ${c.name}`} onOpen={(c) => go(`${LIST}/${encodeURIComponent(c.id)}`)} exportName="integrations" />
            : <Empty icon="ext" title="No connections yet">Set up a connector above. Each one is read-only and is approved by a second admin before it reads anything.</Empty>}
        </div></div>
        {runs.length ? <div className="card"><div className="c-head"><h3>Recent syncs</h3></div><div className="c-body" style={{ padding: "8px 14px" }}>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "var(--ink-2)", display: "flex", flexDirection: "column", gap: 3 }}>
            {runs.slice(0, 10).map((r: Conn) => <li key={r.id}><span className="num">{r.when}</span> {connections.find((c: Conn) => c.id === r.conn)?.label ?? r.conn}: {r.ok ? `${r.pass} pass, ${r.fail} fail, ${r.needs} need data` : `failed: ${r.error}`} ({r.by})</li>)}
          </ul></div></div> : null}
      </div></div>
    </Page>
  );
}

function SetupForm({ c }: { c: Conn }) {
  const L = useLayer();
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(c.fields.map((f: Conn) => [f.key, c.config?.[f.key] ?? ""])));
  const choices: { id: string; label: string }[] = c.verified?.choices ?? [];
  const [pick, setPick] = useState(() => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("installation") ?? choices[0]?.id ?? "");
  const needsSignIn = !!c.verify || (c.provider !== "aws" && c.provider !== "okta" && !c.verified);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); L.toast("Copied"); } catch { L.toast("Copy did not work here. Select the text and copy it yourself.", "info"); } };
  const go = async () => {
    setBusy(true); setErr("");
    try { const r = await svc.connectConnection(c.id, choices.length ? { ...v, installationId: pick } : v); L.toast(`${r.label}: the test passed. A second admin must approve the connection.`); }
    catch (e) { setErr(uiMessage(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="card"><div className="c-head"><h3>Set up {c.name}</h3></div><div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 820 }}>
      <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.55, display: "flex", flexDirection: "column", gap: 6, overflowWrap: "anywhere" }}>{c.instructions.map((s: string, i: number) => <li key={i}>{s}</li>)}</ol>
      {c.externalId ? <div className="field"><label htmlFor="int-ext">External id (for the role&apos;s trust policy)</label><div style={{ display: "flex", gap: 8 }}><input className="input num" id="int-ext" readOnly value={c.externalId} /><button className="btn btn-secondary sm" onClick={() => copy(c.externalId)}><Icon name="copy" />Copy</button></div></div> : null}
      {c.jwk ? <div className="field"><label htmlFor="int-jwk">Public key for Okta (JSON)</label><div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><textarea className="input num" id="int-jwk" readOnly rows={3} value={c.jwk} style={{ fontSize: 11.5 }} /><button className="btn btn-secondary sm" onClick={() => copy(c.jwk)}><Icon name="copy" />Copy</button></div><p className="field help">Selvara keeps the matching private key sealed; it is never shown.</p></div> : null}
      {c.verify ? <div><a className="btn btn-primary" href={c.verify.url}><Icon name="access" />{c.verify.label}</a><p className="field help">You return here afterwards. Selvara keeps only what the provider says about your organisation, never your password.</p></div> : null}
      {c.verified ? <p className="field help" style={{ margin: 0 }}><Chip cls="ok" icon="check">Organisation confirmed</Chip> by {c.verified.by}, {c.verified.at}{c.verified.config ? `: ${Object.values(c.verified.config).join(", ")}` : ""}</p> : null}
      {choices.length > 1 ? <div className="field"><label htmlFor="int-inst">Installation</label><select className="select" id="int-inst" value={pick} onChange={(e) => setPick(e.target.value)}>{choices.map((ch) => <option key={ch.id} value={ch.id}>{ch.label} (installation {ch.id})</option>)}</select></div> : null}
      {c.fields.map((f: Conn) => (
        <div className="field" key={f.key}><label htmlFor={`int-${f.key}`}>{f.label} <span style={{ color: "var(--bad-ink)" }}>*</span></label>
          <input className="input" id={`int-${f.key}`} required aria-required="true" placeholder={f.example} value={v[f.key] ?? ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} aria-describedby={`int-${f.key}-help`} autoComplete="off" spellCheck={false} />
          <p className="field help" id={`int-${f.key}-help`}>{f.help}</p></div>
      ))}
      {err ? <p className="field help" role="alert" style={{ color: "var(--bad-ink)" }}>{err}</p> : null}
      <div className="btngrp"><button className="btn btn-primary" disabled={busy || c.status === "Pending approval" || (needsSignIn && !c.verified)} onClick={go}><Icon name="check" />{busy ? "Testing…" : c.status === "Pending approval" ? "Waiting for approval" : "Test and request approval"}</button></div>
      <p className="field help" style={{ margin: 0 }}>Selvara makes one small read to test the connection. Nothing is read regularly until a second admin approves.</p>
    </div></div>
  );
}

function ConnectionPage({ id }: { id: string }) {
  useData(); const L = useLayer(); const go = useGo(); const { connections, runs } = useG7();
  const c = connections.find((x: Conn) => x.id === id);
  const back = { href: LIST, label: "Integrations" };
  if (!c) return <Page title="Connection not found" back={back}><Empty icon="ext" title="No such connection">There is no connection with the id &ldquo;{id}&rdquo;.</Empty></Page>;
  const sync = () => attempt(L, async () => { const r = await svc.syncConnection(c.id); L.toast(r.ok ? `${c.label} synced` : `Sync failed: ${r.error}`, r.ok); });
  const disconnect = () => askReason(L, { title: `Disconnect ${c.label}?`, label: "Why it is disconnected", danger: true, confirm: "Disconnect",
    intro: "Selvara stops reading, erases the account list and its sealed key, and its checks need data again. Also remove Selvara's access on the provider's side (the app, role or consent).",
    run: async (reason) => { await svc.disconnectConnection(c.id, reason); if (c.status !== "Connected") go(LIST); return `${c.label} ${c.status === "Connected" ? "disconnected" : "set-up cancelled"}`; } });
  const link = (t: Conn) => askReason(L, { title: `Link "${t.name}" to a control`, label: "", confirm: "Link", select: DATA.controls.filter((x: Conn) => !t.controls.includes(x.id)).map((x: Conn) => ({ id: x.id, name: `${x.id} ${x.title}` })), selectLabel: "Control",
    intro: "The control then follows this check's result (with the other tests linked to it).", run: async (_t, pick) => { await svc.linkCheck(t.id, pick, true); return "Linked"; } });
  const unlink = (t: Conn, ctl: string) => attempt(L, async () => { await svc.linkCheck(t.id, ctl, false); L.toast("Link removed"); });
  const accCols: DTColumn<Conn>[] = [
    { key: "name", header: "Account", value: (a) => a.name, locked: true, render: (a) => <span className="strong">{a.name}{a.email && a.email !== a.name ? <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 400 }}>{a.email}</div> : null}</span> },
    { key: "status", header: "Status", value: (a) => a.status, render: (a) => (a.status === "Active" ? <Chip cls="ok" icon="dot">Active</Chip> : <Chip cls="neutral" icon="dot">{a.status}</Chip>) },
    { key: "mfa", header: "MFA", value: (a) => String(a.mfa), render: (a) => (a.mfa === true ? <Chip cls="ok" icon="check">Enrolled</Chip> : a.mfa === false ? <Chip cls="bad" icon="x">None</Chip> : <span style={{ color: "var(--faint)" }}>Unknown</span>) },
    { key: "admin", header: "Admin", value: (a) => (a.admin ? "Yes" : "No"), render: (a) => (a.admin ? "Yes" : "No") },
    { key: "last", header: "Last sign-in", value: (a) => a.lastLogin ?? "", render: (a) => <span style={{ color: "var(--muted)" }}>{a.lastLogin ?? "—"}</span> },
    { key: "member", header: "Selvara member", value: (a) => a.member ?? "", render: (a) => (a.member ?? <span style={{ color: "var(--faint)" }}>Not matched</span>) },
  ];
  const setup = c.status === "Setting up" || c.status === "Pending approval" || c.status === "Not approved";
  return (
    <Page title={c.label} sub={`${c.name} · ${c.type} · ${c.id}`} back={back} acts={<><HealthOf c={c} />
      {c.status === "Connected" ? <><button className="btn btn-secondary" onClick={sync}><Icon name="refresh" />Sync now</button><button className="btn btn-ghost" onClick={disconnect}><Icon name="x" />Disconnect</button></> : null}
      {setup ? <button className="btn btn-ghost" onClick={disconnect}><Icon name="x" />Cancel setup</button> : null}</>}>
      <div className="scroll" style={{ flex: "1 1 auto" }}><div style={{ display: "flex", flexDirection: "column", gap: 14, paddingRight: 2 }}>
        <ApprovalsPanel prefix="integration." title="Connection approvals (second admin)" />
        {setup ? <SetupForm c={c} /> : null}
        {c.status === "Disconnected" ? <div className="card" style={{ boxShadow: "none", background: "var(--surface-2)" }}><div className="c-body" style={{ padding: "10px 14px", fontSize: 13 }}>Disconnected by {c.disconnectedBy}: {c.disconnectReason}. Its account list was erased.</div></div> : null}
        {c.lastError ? <div className="card" style={{ boxShadow: "none", background: "var(--bad-bg)", borderColor: "transparent" }}><div className="c-body" role="alert" style={{ padding: "10px 14px", fontSize: 13, color: "var(--bad-ink)" }}>The last sync failed: {c.lastError}</div></div> : null}
        <div className="card"><div className="c-head"><h3>Details</h3></div><div className="c-body"><dl className="meta-grid">
          <dt>Reads</dt><dd>{c.scope}</dd><dt>Set up by</dt><dd>{c.createdBy}</dd><dt>Approved by</dt><dd>{c.approvedBy ?? "—"}</dd><dt>Connected</dt><dd>{c.connected || "—"}</dd><dt>Last sync</dt><dd>{c.lastSync}</dd>
          {Object.keys(c.counts ?? {}).length ? <><dt>Last read</dt><dd>{Object.entries(c.counts).map(([k, n]) => `${n} ${n === 1 ? String(k).replace(/ies$/, "y").replace(/s$/, "") : k}`).join(", ")}</dd></> : null}
        </dl><p className="field help" style={{ margin: "10px 0 0" }}>Read-only: Selvara never changes anything in {c.name}. Results become automated tests in Controls; AI applications people use appear under AI governance, Discovered AI; applications matching a vendor appear on that vendor.</p></div></div>
        {c.checks.length ? <div className="card"><div className="c-head"><h3>Checks</h3></div><div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {c.checks.map((t: Conn) => (
            <div key={t.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><ResultChip r={t.result} /><span className="strong">{t.name}</span><span style={{ fontSize: 11.5, color: "var(--muted)", marginLeft: "auto" }}>{t.id} · {t.last}</span></div>
              {t.note ? <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 4 }}>{t.note}</div> : null}
              {t.items?.length && t.result === "Fail" ? <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--ink-2)" }}>{t.items.map((it: Conn, i: number) => <li key={i}>{it.item}</li>)}</ul> : null}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>Controls:</span>
                {t.controls.map((ctl: string) => <span key={ctl} className="tag" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{ctl}<button className="icon-btn" style={{ width: 20, height: 20 }} aria-label={`Unlink ${ctl}`} onClick={() => unlink(t, ctl)}><Icon name="x" /></button></span>)}
                <button className="btn btn-ghost sm" aria-label={`Link a control to: ${t.name}`} onClick={() => link(t)}><Icon name="plus" />Link control</button>
              </div>
            </div>
          ))}
        </div></div> : null}
        {c.accounts.length ? <div className="card"><div className="c-head"><h3>Accounts</h3><span className="tag" style={{ marginLeft: 6 }}>{c.accounts.length}</span></div><div className="c-body flush" style={{ padding: 0 }}>
          <DataTable<Conn> id="integration-accounts" label="Accounts" rows={c.accounts} rowKey={(a) => a.key} columns={accCols} searchText={(a) => `${a.name} ${a.email}`}
            tabs={[{ key: "nomfa", label: "No MFA", match: (a: Conn) => a.status === "Active" && a.mfa === false }, { key: "admin", label: "Admins", match: (a: Conn) => a.admin }, { key: "unmatched", label: "Not matched", match: (a: Conn) => !a.member }]} />
        </div></div> : null}
        {runs.some((r: Conn) => r.conn === c.id) ? <div className="card"><div className="c-head"><h3>Sync history</h3></div><div className="c-body" style={{ padding: "8px 14px" }}>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "var(--ink-2)" }}>{runs.filter((r: Conn) => r.conn === c.id).slice(0, 15).map((r: Conn) => <li key={r.id}><span className="num">{r.when}</span> {r.ok ? `${r.pass} pass, ${r.fail} fail, ${r.needs} need data` : `failed: ${r.error}`} ({r.by})</li>)}</ul>
        </div></div> : null}
      </div></div>
    </Page>
  );
}
