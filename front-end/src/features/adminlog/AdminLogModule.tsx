import { DataTable, Icon, KpiStrip, KpiTile, Page, activate, type DTColumn } from "@/components/ui";
import { ADMIN_AUDIT, verifyChain } from "@/lib/adminAudit";
import { LAWFUL_BASIS } from "@/lib/platform";
import { ropaById, ropaFor } from "@/lib/ropa";
import { useApp, useData, useModState } from "@/lib/store";
import { useLayer } from "@/hooks/useLayer";
import * as svc from "@/features/adminlog/services/adminlog";
import { openConfirmReset } from "@/features/team";
import { useGate } from "@/components/kit/admin/ElevateGate";
import { AdminChainView, AdminExportsView } from "./AdminViews";
import { RopaRegister } from "@/features/auditlog";

type Entry = ReturnType<typeof svc.alogRows>[number];
const ALL_ENTRIES = { q: "", tenant: "All", basis: "All" };

const VIEWS: [string, string][] = [["log", "Audit log"], ["chain", "Chain integrity"], ["ropa", "RoPA register"], ["exp", "Evidence export"]];
const FAIL = "Could not complete that action";

/** Prototype: REND.adminlog. Read-only viewer: rows can only be filtered/exported, never edited or deleted. */
export default function AdminLogModule() {
  useData();
  const L = useLayer(); const gate = useGate();
  const can = svc.canAdminLog(useApp((s) => s.role));
  const [v, setV] = useModState<string>("adminlog.view", "log");
  const view = VIEWS.some((x) => x[0] === v) ? v : "log";
  const filter = ALL_ENTRIES;
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
  const tenants = Array.from(new Set(ADMIN_AUDIT.map((l) => svc.tenantName(l.tenant))));
  const cols: DTColumn<Entry>[] = [
    { key: "seq", header: "#", value: (l) => l.seq, render: (l) => <span className="num" style={{ color: "var(--muted)" }}>{l.seq}</span>, locked: true },
    { key: "at", header: "Timestamp (UTC)", value: (l) => l.at, render: (l) => <span className="num" style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{l.at}</span> },
    { key: "actor", header: "Actor / role", value: (l) => `${l.actor} (${l.role})`, render: (l) => <><div className="strong">{l.actor}</div><div style={{ fontSize: 11, color: "var(--muted)" }}>{l.role}</div></> },
    { key: "tenant", header: "Tenant", value: (l) => svc.tenantName(l.tenant), render: (l) => svc.tenantName(l.tenant) },
    { key: "action", header: "Action", value: (l) => l.action, render: (l) => <span className="num">{l.action}</span> },
    { key: "object", header: "Object", value: (l) => l.object, render: (l) => l.object },
    { key: "ropa", header: "RoPA activity", value: (l) => ropaFor(l), render: (l) => {
      const rp = ropaById(ropaFor(l));
      return <span className="tag num" style={{ cursor: "pointer" }} aria-label={rp ? `Open RoPA register, ${rp.id}` : "Open RoPA register"} {...activate(() => setV("ropa"))}>{rp ? rp.id : "—"}</span>;
    } },
    { key: "basis", header: "Basis", value: (l) => l.basis, render: (l) => l.basis },
    { key: "cats", header: "Categories", defaultHidden: true, value: (l) => (l.categories || []).join("; "), render: (l) => <>{(l.categories || []).map((c, i) => <span key={i}>{i ? " " : ""}<span className="tagchip">{c}</span></span>)}</> },
    { key: "ip", header: "IP", defaultHidden: true, value: (l) => l.ip, render: (l) => <span className="num" style={{ color: "var(--muted)" }}>{l.ip}</span> },
    { key: "hash", header: "Hash", defaultHidden: true, value: (l) => l.hash, render: (l) => <span className="num" style={{ fontSize: 11, color: "var(--muted)" }}>{l.hash}</span> },
  ];
  const filters = [
    { key: "tenant", label: "Tenant", options: tenants, get: (l: Entry) => svc.tenantName(l.tenant) },
    { key: "basis", label: "Lawful basis", options: [...LAWFUL_BASIS], get: (l: Entry) => l.basis },
  ];
  const all = svc.alogRows(ALL_ENTRIES);
  return (
    <Page mod="adminlog" acts={acts}>
      <KpiStrip label="Admin log summary">
        <KpiTile label="Entries" value={all.length} delta={{ tone: "flat", text: "Append-only" }} caption="Read-only; never edited or deleted" />
        <KpiTile label="Chain" value={chainOk ? "Intact" : "Broken"} delta={{ tone: chainOk ? "good" : "bad", text: chainOk ? "Hashes verified" : "Verification failed" }} caption="Each entry hashes the one before" />
        <KpiTile label="Tenants touched" value={tenants.length} delta={{ tone: "flat", text: "Includes platform" }} caption="Distinct scopes in the log" />
        <KpiTile label="Latest event" value={all[0] ? all[0].at.slice(0, 10) : "None"} delta={{ tone: "flat", text: all[0] ? all[0].action : "No events" }} caption="Newest entry" />
      </KpiStrip>
      <div className="card" style={{ flex: "1 1 auto", minHeight: 0 }}>
        <div className="c-head" style={{ flexWrap: "wrap", gap: 8 }}>
          <div className="seg" role="tablist">{VIEWS.map((x) => <button key={x[0]} role="tab" aria-selected={view === x[0]} onClick={() => setV(x[0])}>{x[1]}</button>)}</div>
          <span id="alChain" role="status" style={{ marginLeft: "auto", fontSize: 12 }}>
            {chainOk ? <span style={{ color: "var(--ok-ink)" }}><Icon name="check" /> Chain intact, {ADMIN_AUDIT.length} entries</span> : <span style={{ color: "var(--bad-ink)" }}><Icon name="alert" /> Chain broken</span>}
          </span>
        </div>
        <div className={`c-body ${view === "log" ? "flush" : ""} scroll`} style={{ ...(view === "log" ? { padding: 0 } : {}), minHeight: 0 }} id="alogBody">
          {view === "chain" ? <AdminChainView ok={chainOk} onVerify={doVerify} can={can} />
            : view === "ropa" ? <RopaRegister entries={ADMIN_AUDIT} intro="Record of Processing Activities under GDPR Article 30. Each admin and workspace event is tagged to one of these activities. Synthetic sample — confirm with the DPO before relying on it." />
            : view === "exp" ? <AdminExportsView onGenerate={doPackage} can={can} />
            : (
              <DataTable<Entry> id="admin-log" label="Admin audit log" rows={rows} rowKey={(l) => String(l.seq)} columns={cols} searchText={(l) => `${l.actor} ${l.action} ${l.object} ${l.ip} ${l.role}`} filters={filters} exportName="admin-audit-log" />
            )}
        </div>
      </div>
    </Page>
  );
}
