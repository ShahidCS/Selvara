import { useState } from "react";
import { Chip, Table } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { useData } from "@/lib/store";
import * as gov from "./services/governance";
import { Reason } from "./RulesTab";

const years = (m: number) => (m % 12 === 0 ? `${m / 12} year${m === 12 ? "" : "s"}` : `${m} month${m === 1 ? "" : "s"}`);

/** Data retention (DRAFT for review): how long each kind of record is kept, the minimum, and legal holds. Shorter is four-eyes and never below the minimum. */
export function RetentionTab({ manage }: { manage: boolean }) {
  useData(); const L = useLayer();
  return (
    <div style={{ maxWidth: 960, display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="banner warn" style={{ margin: 0 }}><b>Draft for review.</b> The periods and minimums are proposals; compliance must confirm them for each regulator (for example, FATF Recommendation 11 asks for at least five years of due-diligence and transaction records). Keeping data longer takes effect at once; keeping it for less time needs a different company admin to approve and can never go below the minimum. A legal hold stops all deletion of that kind of record until a different admin approves releasing it. In this demonstration nothing is deleted; production purges run as a server job.</div>
      <Table cols={[{ t: "Records" }, { t: "Keep for" }, { t: "Minimum" }, { t: "Status" }, { t: "" }]}>
        {gov.RETENTION.map((t) => {
          const prev = gov.retentionPreview(t.id);
          return (
            <tr key={t.id}>
              <td className="strong">{t.label}<div style={{ fontSize: ".71875rem", color: "var(--muted)", fontWeight: 400 }}>{t.basis}</div></td>
              <td className="num">{years(t.months)}{t.pendingShorter ? <div style={{ fontSize: ".71875rem", color: "var(--muted)" }}>{years(t.pendingShorter.months)} awaiting approval</div> : null}</td>
              <td className="num">{years(t.floor)}</td>
              <td>{t.hold ? <Chip cls="warn" icon="alert">{t.hold.releaseApproval ? "Legal hold (release requested)" : "Legal hold"}</Chip> : <Chip cls="neutral" icon="dot">{prev.due ? `${prev.due} past retention` : "Nothing due"}</Chip>}</td>
              <td className="r">{manage ? (
                <div className="btngrp" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <button className="btn btn-ghost sm" aria-label={`Change retention: ${t.label}`} onClick={() => L.openModal(`Change retention: ${t.label}`, (close) => <ChangeForm id={t.id} close={close} />)}>Change</button>
                  {t.hold ? (t.hold.releaseApproval ? null : <button className="btn btn-ghost sm" aria-label={`Release legal hold: ${t.label}`} onClick={() => L.openModal(`Release legal hold: ${t.label}`, (close) => <Reason close={close} label="Request release" run={(why) => { gov.requestRelease(t.id, why); L.toast("A different company admin must approve releasing the hold"); }} />)}>Release hold</button>)
                    : <button className="btn btn-ghost sm" aria-label={`Place legal hold: ${t.label}`} onClick={() => L.openModal(`Place legal hold: ${t.label}`, (close) => <Reason close={close} label="Place hold" danger run={(why) => { gov.placeHold(t.id, why); L.toast("Legal hold placed: nothing of this kind will be deleted"); }} />)}>Legal hold</button>}
                </div>
              ) : null}</td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}

function ChangeForm({ id, close }: { id: string; close: () => void }) {
  const L = useLayer(); const t = gov.RETENTION.find((x) => x.id === id) as gov.RetentionType;
  const [months, setMonths] = useState(String(t.months));
  return <Reason close={close} label="Save" extra={
    <div className="field"><label htmlFor="rt-m">Keep for (months, at least {t.floor})</label><input className="input num" id="rt-m" type="number" min={t.floor} max={240} value={months} onChange={(e) => setMonths(e.target.value)} /></div>
  } run={(why) => { const r = gov.setRetention(id, Number(months), why); L.toast(r.pending ? "A shorter period needs a different company admin to approve" : "Retention updated"); }} />;
}
