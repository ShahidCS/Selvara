import { Icon, Page, Table, activate } from "@/components/ui";
import { ADMIN_AUDIT, verifyChain } from "@/lib/adminAudit";
import { LAWFUL_BASIS, custList } from "@/lib/platform";
import { ropaById, ropaFor } from "@/lib/ropa";
import { useApp, useData, useModState } from "@/lib/store";
import { useLayer } from "@/hooks/useLayer";
import * as svc from "@/services/adminlog";
import { openConfirmReset } from "./team/ResetDemo";
import { useGate } from "./admin/ElevateGate";
import { AdminChainView, AdminExportsView } from "./adminlog/AdminViews";
import { RopaRegister } from "./auditlog/RopaRegister";

const VIEWS: [string, string][] = [["log", "Audit log"], ["chain", "Chain integrity"], ["ropa", "RoPA register"], ["exp", "Evidence export"]];
const FAIL = "Could not complete that action";

/** Prototype: REND.adminlog. Read-only viewer: rows can only be filtered/exported, never edited or deleted. */
export default function AdminLogModule() {
  useData();
  const L = useLayer(); const gate = useGate();
  const can = svc.canAdminLog(useApp((s) => s.role));
  const [v, setV] = useModState<string>("adminlog.view", "log");
  const [q, setQ] = useModState<string>("adminlog.q", "");
  const [tenantRaw, setTenant] = useModState<string>("adminlog.tenant", "All");
  const [basisRaw, setBasis] = useModState<string>("adminlog.basis", "All");
  const view = VIEWS.some((x) => x[0] === v) ? v : "log";
  const custs = custList();
  const tenant = tenantRaw === "All" || tenantRaw === "" || custs.some((c) => c.id === tenantRaw) ? tenantRaw : "All";
  const basis = basisRaw === "All" || LAWFUL_BASIS.includes(basisRaw) ? basisRaw : "All";
  const filter = { q, tenant, basis };
  const chainOk = verifyChain();
  const run = async (fn: () => Promise<unknown>, done: (r: unknown) => void) => { try { done(await fn()); } catch { L.toast(FAIL, false); } };
  const doVerify = () => run(svc.verify, (ok) => L.toast(ok ? "Chain verified: intact" : "Chain verification FAILED", !!ok));
  const doExport = (fmt: "json" | "csv") => run(() => svc.exportLog(fmt, filter), () => L.toast("Exported admin log (" + fmt.toUpperCase() + ")"));
  const doRopa = (fmt: "json" | "csv") => run(() => svc.exportRopa(fmt), () => L.toast("RoPA register exported (" + fmt.toUpperCase() + ")"));
  const doPackage = () => run(svc.generatePackage, (id) => L.toast("Evidence package " + String(id) + " generated"));
  const expBtns = (fn: (f: "json" | "csv") => void) => (
    <><button className="btn btn-secondary" disabled={!can} onClick={() => fn("json")}><Icon name="download" />JSON</button><button className="btn btn-secondary" disabled={!can} onClick={() => fn("csv")}><Icon name="download" />CSV</button></>
  );
  const acts = view === "ropa" ? expBtns(doRopa) : view === "exp" ? undefined : (
    <><button className="btn btn-secondary" disabled={gate.locked} title={gate.title} onClick={() => openConfirmReset(L)}><Icon name="alert" />Reset demo data</button>{expBtns(doExport)}</>
  );
  const rows = view === "log" ? svc.alogRows(filter) : [];
  return (
    <Page mod="adminlog" acts={acts}>
      <div className="card" style={{ flex: "1 1 auto", minHeight: 0 }}>
        <div className="c-head" style={{ flexWrap: "wrap", gap: 8 }}>
          <div className="seg" role="tablist">{VIEWS.map((x) => <button key={x[0]} role="tab" aria-selected={view === x[0]} onClick={() => setV(x[0])}>{x[1]}</button>)}</div>
          {view === "log" ? (
            <>
              <div className="field" style={{ margin: 0 }}><label className="vh" htmlFor="alq">Search log</label><input className="input" id="alq" placeholder="Search actor, action, object, IP…" style={{ width: 220, height: 32 }} maxLength={100} autoComplete="off" value={q} onChange={(e) => setQ(e.target.value.slice(0, 100))} /></div>
              <div className="field" style={{ margin: 0 }}><label className="vh" htmlFor="altenant">Tenant</label>
                <select className="select" id="altenant" style={{ height: 32 }} value={tenant} onChange={(e) => setTenant(e.target.value)}>
                  <option value="All">All tenants</option><option value="">Platform (no tenant)</option>
                  {custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
              <div className="field" style={{ margin: 0 }}><label className="vh" htmlFor="albasis">Lawful basis</label>
                <select className="select" id="albasis" style={{ height: 32 }} value={basis} onChange={(e) => setBasis(e.target.value)}>
                  <option value="All">All lawful bases</option>{LAWFUL_BASIS.map((b) => <option key={b}>{b}</option>)}
                </select></div>
            </>
          ) : null}
          <span id="alChain" role="status" style={{ marginLeft: "auto", fontSize: 12 }}>
            {chainOk ? <span style={{ color: "var(--ok-ink)" }}><Icon name="check" /> Chain intact, {ADMIN_AUDIT.length} entries</span> : <span style={{ color: "var(--bad-ink)" }}><Icon name="alert" /> Chain broken</span>}
          </span>
        </div>
        <div className={`c-body ${view === "log" ? "flush" : ""} scroll`} style={{ ...(view === "log" ? { padding: 0 } : {}), minHeight: 0 }} id="alogBody">
          {view === "chain" ? <AdminChainView ok={chainOk} onVerify={doVerify} can={can} />
            : view === "ropa" ? <RopaRegister entries={ADMIN_AUDIT} intro="Record of Processing Activities under GDPR Article 30. Each admin and workspace event is tagged to one of these activities. Synthetic sample — confirm with the DPO before relying on it." />
            : view === "exp" ? <AdminExportsView onGenerate={doPackage} can={can} />
            : !rows.length ? <div className="empty"><div className="ei"><Icon name="search" /></div><h4>No matching events</h4><p>No admin events match the current filters.</p></div>
            : (
              <Table cols={[{ t: "#" }, { t: "Timestamp (UTC)" }, { t: "Actor / role" }, { t: "Tenant" }, { t: "Action" }, { t: "Object" }, { t: "RoPA activity" }, { t: "Basis" }, { t: "Categories" }, { t: "IP" }, { t: "Hash" }]} minw={1180}>
                {rows.map((l) => {
                  const rp = ropaById(ropaFor(l));
                  return (
                    <tr key={l.seq}>
                      <td className="num" style={{ color: "var(--muted)" }}>{l.seq}</td>
                      <td className="num" style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{l.at}</td>
                      <td><div className="strong">{l.actor}</div><div style={{ fontSize: 11, color: "var(--muted)" }}>{l.role}</div></td>
                      <td>{svc.tenantName(l.tenant)}</td><td className="num">{l.action}</td><td>{l.object}</td>
                      <td style={{ fontSize: 11.5 }}><span className="tag num" style={{ cursor: "pointer" }} aria-label={rp ? `Open RoPA register (${rp.id})` : "Open RoPA register"} {...activate(() => setV("ropa"))}>{rp ? rp.id : "—"}</span></td>
                      <td>{l.basis}</td>
                      <td style={{ fontSize: 11.5 }}>{(l.categories || []).map((c, i) => <span key={i}>{i ? " " : ""}<span className="tagchip">{c}</span></span>)}</td>
                      <td className="num" style={{ color: "var(--muted)" }}>{l.ip}</td>
                      <td className="num" style={{ fontSize: 11, color: "var(--muted)" }}>{l.hash}</td>
                    </tr>
                  );
                })}
              </Table>
            )}
        </div>
      </div>
    </Page>
  );
}
