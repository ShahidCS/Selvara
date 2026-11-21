import { ModuleTip } from "@/components/kit/ModuleTip";
import { Chip, DataTable, Icon, Page, activate, type DTColumn } from "@/components/ui";
import { WS_AUDIT, verifyWsChain } from "@/lib/audit";
import { ropaById, ropaFor } from "@/lib/ropa";
import { useApp, useData, useModState } from "@/lib/store";
import { SUBNAV } from "@/lib/subnav";
import { useLayer } from "@/hooks/useLayer";
import { API_ON } from "@/lib/rbac";
import { uiMessage } from "@/lib/grcSod";
import * as svc from "@/features/auditlog/services/auditlog";
import { ChainView } from "./ChainView";
import { EvidenceView } from "./EvidenceView";
import { RopaRegister } from "./RopaRegister";

const VIEWS = SUBNAV.auditlog.items;
const RISKY = "Could not complete that action";
type Entry = (typeof WS_AUDIT)[number];

export default function AuditLogModule() {
  useData();
  const L = useLayer();
  const can = svc.canAuditLog(useApp((s) => s.role));
  const [v, setV] = useModState<string>("auditlog.view", "log");
  const view = VIEWS.some((x) => x[0] === v) ? v : "log";
  const chainOk = API_ON ? svc.serverFirstBad() == null : verifyWsChain();
  const run = async (fn: () => Promise<unknown>, done: (r: unknown) => void) => {
    try { done(await fn()); } catch (e) { L.toast(API_ON ? uiMessage(e) : RISKY, false); }
  };
  const doVerify = () => run(svc.verifyChain, (ok) => L.toast(ok ? "Chain verified: intact" : "Chain verification FAILED", !!ok));
  const doExport = (fmt: "json" | "csv") => run(() => svc.exportLog(fmt), () => L.toast("Audit log exported (" + fmt.toUpperCase() + ")"));
  const doRopa = (fmt: "json" | "csv") => run(() => svc.exportRopa(fmt), () => L.toast("RoPA register exported (" + fmt.toUpperCase() + ")"));
  const doPackage = () => run(svc.generatePackage, (id) => L.toast("Evidence package " + String(id) + " generated"));
  const expBtns = (fn: (f: "json" | "csv") => void) => (
    <><button className="btn btn-secondary" disabled={!can} onClick={() => fn("json")}><Icon name="download" />Export JSON</button><button className="btn btn-secondary" disabled={!can} onClick={() => fn("csv")}><Icon name="download" />Export CSV</button></>
  );
  const acts = view === "ropa" ? expBtns(doRopa) : view === "exp" ? undefined : view === "log" ? expBtns(doExport) : undefined;
  const rows = WS_AUDIT.slice().reverse();
  const cols: DTColumn<Entry>[] = [
    { key: "seq", header: "#", value: (l) => l.seq, render: (l) => <span className="num" style={{ color: "var(--muted)" }}>{l.seq}</span> },
    { key: "at", header: "Timestamp", value: (l) => l.at, render: (l) => <span className="num" style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{l.at}</span> },
    { key: "cat", header: "Category", value: (l) => l.cat, render: (l) => <Chip cls="neutral">{l.cat}</Chip> },
    { key: "actor", header: "Actor", value: (l) => l.actor, locked: true, render: (l) => <span className="strong" style={{ whiteSpace: "nowrap" }}>{l.actor}</span> },
    { key: "action", header: "Action", value: (l) => l.action, render: (l) => <span className="num">{l.action}</span> },
    { key: "target", header: "Target", value: (l) => l.target, render: (l) => <span style={{ display: "block", minWidth: 160, maxWidth: 320 }}>{l.target}</span> },
    { key: "ropa", header: "RoPA activity", value: (l) => ropaFor(l) || "", render: (l) => {
      const rp = ropaById(ropaFor(l));
      return rp ? <span className="tag num" style={{ cursor: "pointer" }} aria-label={`Open RoPA register, ${rp.id}`} {...activate(() => setV("ropa"))}>{rp.id}</span> : <span style={{ color: "var(--faint)" }}>—</span>;
    } },
    { key: "hash", header: "Hash", value: (l) => l.hash, render: (l) => <span className="num" title={l.hash} style={{ fontSize: 11, color: "var(--muted)" }}>{API_ON && l.hash ? l.hash.slice(0, 12) + "…" : l.hash}</span> },
  ];
  return (
    <Page mod="auditlog" acts={acts}>
      <ModuleTip mod="auditlog" />
      <div className="card" style={{ flex: "0 1 auto", minHeight: 0 }}>
        <div className="c-head" style={{ flexWrap: "wrap", gap: 8 }}>
          <div className="tabs" role="tablist" aria-label="Audit log views">{VIEWS.map((x) => <button key={x[0]} className="tab" role="tab" aria-selected={view === x[0]} onClick={() => setV(x[0])}>{x[1]}</button>)}</div>
          <span className="r" style={{ marginLeft: "auto", fontSize: 12 }} role="status">
            {API_ON && !svc.lastVerified() ? <span style={{ color: "var(--muted)" }}><Icon name="clock" /> Not verified yet: use Chain integrity</span>
              : chainOk ? <span style={{ color: "var(--ok-ink)" }}><Icon name="check" /> {API_ON ? `Verified ${svc.lastVerified()}, ` : ""}Chain intact, {WS_AUDIT.length}{API_ON && WS_AUDIT.length >= 500 ? "+ (newest 500 shown; export for all)" : ""} entries</span> : <span style={{ color: "var(--bad-ink)" }}><Icon name="alert" /> Chain broken</span>}
          </span>
        </div>
        <div className={`c-body ${view === "log" ? "flush" : ""} scroll`} style={view === "log" ? { padding: 0 } : undefined} id="audBodyL">
          {view === "chain" ? <ChainView ok={chainOk} onVerify={doVerify} can={can} />
            : view === "ropa" ? <RopaRegister entries={WS_AUDIT} intro={API_ON ? "Record of Processing Activities under GDPR Article 30: a reference register to adapt to your company. Each event in your log is tagged to one of these activities. Confirm with your DPO before relying on it." : "Record of Processing Activities under GDPR Article 30. Each event is tagged to one of these activities. Synthetic sample — confirm with the DPO before relying on it."} />
            : view === "exp" ? <EvidenceView onGenerate={doPackage} can={can} />
            : (
              <DataTable<Entry> id="audit-log" label="Audit log" rows={rows} rowKey={(l) => String(l.seq)} columns={cols} searchText={(l) => `${l.actor} ${l.action} ${l.target} ${l.cat}`}
                tabs={svc.AUDIT_CATS.filter((c) => c !== "All").map((c) => ({ key: c, label: c, match: (l: Entry) => l.cat === c }))} exportName={API_ON ? undefined : "audit-log"} />
            )}
        </div>
      </div>
    </Page>
  );
}
