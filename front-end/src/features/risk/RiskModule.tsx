/* Risk Register (ISO/IEC 27005). Source: prototype lines 2411-2811 (REND.risk). Tab state is `risk.tab`, shared with the sidebar sub-nav. */
import { useCallback, useEffect, useRef } from "react";
import { Icon, Page } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { wsLog } from "@/lib/audit";
import { DATA } from "@/lib/data";
import { downloadText } from "@/lib/format";
import { riskCanEdit, riskNormAll } from "@/lib/risk";
import { safeFileName } from "@/lib/security";
import { useGo } from "@/lib/route";
import { bumpData, setModState, useApp, useData, useModState } from "@/lib/store";
import * as svc from "@/features/risk/services/risks";
import { openImportWizard } from "./import/openImportWizard";
import { K_SEL, K_TAB, riskOpenDetail, riskSetTab } from "./nav";
import { AddRiskForm } from "./RiskForms";
import RiskCrit from "./RiskCrit";
import RiskDash from "./RiskDash";
import RiskGov from "./RiskGov";
import RiskParties from "./RiskParties";
import RiskRegister from "./RiskRegister";

/* Helpers for other modules (rband, RISK_APPETITE, riskNorm, ... live in src/lib/risk.ts). */
export { riskOpenDetail, riskGoReg } from "./nav";
/** `const openRisk = useRiskDrawer(); openRisk("RK-03")` navigates to the Risk register with that risk's detail panel open. Unknown ids show "Risk not found". */
export function useRiskDrawer() {
  const go = useGo();
  return useCallback((id: string) => {
    setModState(K_SEL, null); riskOpenDetail(id); go("/ws/risk");
  }, [go]);
}

const TABS: [string, string][] = [["dash", "Dashboard"], ["reg", "Register"], ["crit", "Scoring Criteria"], ["ip", "Interested Parties"], ["gov", "Governance"]];

export default function RiskModule() {
  const L = useLayer();
  const role = useApp((s) => s.role);
  riskNormAll();
  const dv = useData();
  const [tab] = useModState(K_TAB, "dash");
  const canEdit = riskCanEdit(role);

  /* the prototype cleared the selection whenever the tab changed (riskTab / sidebar sub-nav); a selection only exists on the Register tab */
  const prev = useRef(tab);
  useEffect(() => { if (prev.current !== tab) { prev.current = tab; if (tab !== "reg") setModState<string | null>(K_SEL, null); } }, [tab]);

  /* reconcile Board-evidence acceptances with their approval requests (approved/rejected/expired elsewhere) */
  useEffect(() => { svc.syncBoardEvidence(); }, [dv]);

  const doImport = () => {
    if (!riskCanEdit()) { L.toast("You do not have permission to import risks", false); return; }
    openImportWizard(L, { onDone: () => { setModState(K_TAB, "reg"); setModState<string | null>(K_SEL, null); bumpData(); } });
  };
  const doExport = async () => {
    try {
      const csv = await svc.exportRegisterCsv();
      downloadText(safeFileName("risk-register.csv"), csv);
      wsLog("risk.register.exported", DATA.risks.length + " risks", "Risk"); L.toast("Risk register exported (CSV)");
    } catch { L.toast("Something went wrong. Please try again.", false); }
  };
  const add = () => L.openModal("Add risk", (close) => <AddRiskForm close={close} />);

  const acts = (
    <>
      {canEdit ? <button className="btn btn-secondary" onClick={doImport}><Icon name="ext" />Import</button> : null}
      <button className="btn btn-secondary" onClick={doExport}><Icon name="download" />Export</button>
      {canEdit ? <button className="btn btn-primary" onClick={add}><Icon name="plus" />Add risk</button> : null}
    </>
  );
  return (
    <Page mod="risk" acts={acts}>
      <div style={{ flex: "0 0 auto", marginBottom: 12, maxWidth: "100%", overflowX: "auto", scrollbarWidth: "thin" }}>
        <div className="seg" role="tablist" aria-label="Risk register sections">
          {TABS.map((t) => <button key={t[0]} id={`risk-tab-${t[0]}`} role="tab" aria-selected={tab === t[0]} aria-controls="riskMain" style={{ whiteSpace: "nowrap" }} onClick={() => riskSetTab(t[0])}>{t[1]}</button>)}
        </div>
      </div>
      <div className="scroll" id="riskMain" role="tabpanel" aria-labelledby={`risk-tab-${tab}`} style={{ flex: "1 1 auto", minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 14, paddingRight: 2 }}>
        {tab === "dash" ? <RiskDash /> : tab === "reg" ? <RiskRegister /> : tab === "crit" ? <RiskCrit /> : tab === "ip" ? <RiskParties /> : <RiskGov />}
      </div>
    </Page>
  );
}
