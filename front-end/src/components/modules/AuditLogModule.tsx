import { Chip, Icon, Page, Table, activate } from "@/components/ui";
import { WS_AUDIT, verifyWsChain } from "@/lib/audit";
import { ropaById, ropaFor } from "@/lib/ropa";
import { useApp, useData, useModState } from "@/lib/store";
import { SUBNAV } from "@/lib/subnav";
import { useLayer } from "@/hooks/useLayer";
import * as svc from "@/services/auditlog";
import { ChainView } from "./auditlog/ChainView";
import { EvidenceView } from "./auditlog/EvidenceView";
import { RopaRegister } from "./auditlog/RopaRegister";

const VIEWS = SUBNAV.auditlog.items;
const RISKY = "Could not complete that action";

export default function AuditLogModule() {
  useData();
  const L = useLayer();
  const can = svc.canAuditLog(useApp((s) => s.role));
  const [v, setV] = useModState<string>("auditlog.view", "log");
  const [filter, setFilter] = useModState<string>("auditlog.filter", "All");
  const view = VIEWS.some((x) => x[0] === v) ? v : "log";
  const cat = svc.AUDIT_CATS.includes(filter) ? filter : "All";
  const chainOk = verifyWsChain();
  const run = async (fn: () => Promise<unknown>, done: (r: unknown) => void) => {
    try { done(await fn()); } catch { L.toast(RISKY, false); }
  };
  const doVerify = () => run(svc.verifyChain, (ok) => L.toast(ok ? "Chain verified: intact" : "Chain verification FAILED", !!ok));
  const doExport = (fmt: "json" | "csv") => run(() => svc.exportLog(fmt), () => L.toast("Audit log exported (" + fmt.toUpperCase() + ")"));
  const doRopa = (fmt: "json" | "csv") => run(() => svc.exportRopa(fmt), () => L.toast("RoPA register exported (" + fmt.toUpperCase() + ")"));
  const doPackage = () => run(svc.generatePackage, (id) => L.toast("Evidence package " + String(id) + " generated"));
  const expBtns = (fn: (f: "json" | "csv") => void) => (
    <><button className="btn btn-secondary" disabled={!can} onClick={() => fn("json")}><Icon name="download" />JSON</button><button className="btn btn-secondary" disabled={!can} onClick={() => fn("csv")}><Icon name="download" />CSV</button></>
  );
  const acts = view === "ropa" ? expBtns(doRopa) : view === "exp" ? undefined : view === "log" ? expBtns(doExport) : undefined;
  const rows = WS_AUDIT.filter((l) => cat === "All" || l.cat === cat).slice().reverse();
  return (
    <Page mod="auditlog" acts={acts}>
      <div className="card" style={{ flex: "0 1 auto", minHeight: 0 }}>
        <div className="c-head" style={{ flexWrap: "wrap", gap: 8 }}>
          <div className="seg" role="tablist">{VIEWS.map((x) => <button key={x[0]} role="tab" aria-selected={view === x[0]} onClick={() => setV(x[0])}>{x[1]}</button>)}</div>
          <div className="btngrp" style={view === "log" ? undefined : { display: "none" }}>
            {svc.AUDIT_CATS.map((c) => (
              <button key={c} className="fchip" aria-pressed={cat === c} onClick={() => setFilter(c)}>
                {c === "All" ? <Icon name="filter" /> : null}{c} <span className="tag" style={{ marginLeft: 2 }}>{c === "All" ? WS_AUDIT.length : WS_AUDIT.filter((l) => l.cat === c).length}</span>
              </button>
            ))}
          </div>
          <span className="r" style={{ marginLeft: "auto", fontSize: 12 }} role="status">
            {chainOk ? <span style={{ color: "var(--ok-ink)" }}><Icon name="check" /> Chain intact, {WS_AUDIT.length} entries</span> : <span style={{ color: "var(--bad-ink)" }}><Icon name="alert" /> Chain broken</span>}
          </span>
        </div>
        <div className={`c-body ${view === "log" ? "flush" : ""} scroll`} style={view === "log" ? { padding: 0 } : undefined} id="audBodyL">
          {view === "chain" ? <ChainView ok={chainOk} onVerify={doVerify} can={can} />
            : view === "ropa" ? <RopaRegister entries={WS_AUDIT} intro="Record of Processing Activities under GDPR Article 30. Each event is tagged to one of these activities. Synthetic sample — confirm with the DPO before relying on it." />
            : view === "exp" ? <EvidenceView onGenerate={doPackage} can={can} />
            : (
              <Table cols={[{ t: "#" }, { t: "Timestamp" }, { t: "Category" }, { t: "Actor" }, { t: "Action" }, { t: "Target" }, { t: "RoPA activity" }, { t: "Hash" }]} minw={1040}>
                {rows.map((l) => {
                  const rp = ropaById(ropaFor(l));
                  return (
                    <tr key={l.seq}>
                      <td className="num" style={{ color: "var(--muted)" }}>{l.seq}</td>
                      <td className="num" style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{l.at}</td>
                      <td><Chip cls={l.cat === "RoPA" ? "info" : "neutral"}>{l.cat}</Chip></td>
                      <td className="strong">{l.actor}</td><td className="num">{l.action}</td><td>{l.target}</td>
                      <td>{rp ? <span className="tag num" style={{ cursor: "pointer" }} aria-label={`Open RoPA register (${rp.id})`} {...activate(() => setV("ropa"))}>{rp.id}</span> : <span className="tag num" style={{ cursor: "pointer" }} aria-label="Open RoPA register" {...activate(() => setV("ropa"))}>—</span>}</td>
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
