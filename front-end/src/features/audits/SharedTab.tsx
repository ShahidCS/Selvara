import Link from "next/link";
import { useState } from "react";
import { Empty, Icon, Table } from "@/components/ui";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { DATA } from "@/lib/data";
import { bumpData } from "@/lib/store";
import { useGo } from "@/lib/route";
import * as svc from "@/services/audits";
import { attempt } from "./util";

/* eslint-disable @typescript-eslint/no-explicit-any */
const KINDS: Record<svc.ShareKind, { label: string; one: string; path: string; name: (x: any) => string }> = {
  controls: { label: "Controls", one: "control", path: "/ws/controls/", name: (x) => String(x.title ?? "") },
  evidence: { label: "Evidence", one: "evidence item", path: "/ws/evidence/", name: (x) => String(x.name ?? "") },
  policies: { label: "Policies", one: "policy", path: "/ws/policies/", name: (x) => String(x.name ?? "") },
};
const listOf = (kind: svc.ShareKind): any[] => ((DATA as any)[kind] as any[]) ?? [];

/** Management picks one of the company's records to share: a search box narrows the list, then the select chooses. */
function ShareAdd({ L, id, kind, have }: { L: LayerApi; id: string; kind: svc.ShareKind; have: string[] }) {
  const k = KINDS[kind]; const [q, setQ] = useState(""); const [pick, setPick] = useState("");
  const needle = q.trim().toLowerCase();
  const opts = listOf(kind).filter((x) => !have.includes(x.id) && (!needle || `${x.id} ${k.name(x)}`.toLowerCase().includes(needle))).slice(0, 200);
  const chosen = opts.some((x) => x.id === pick) ? pick : opts[0]?.id ?? "";
  const share = () => attempt(L, async () => {
    if (!chosen) return;
    await svc.setShared(id, kind, chosen, true); L.toast(`${chosen} shared with the auditor`); setPick(""); bumpData();
  });
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", margin: "0 0 10px" }}>
      <div className="field" style={{ margin: 0, flex: "1 1 160px" }}><label htmlFor={`sh-q-${kind}`}>{`Search ${k.label.toLowerCase()}`}</label>
        <input className="input" id={`sh-q-${kind}`} type="search" maxLength={80} placeholder="ID or name" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="field" style={{ margin: 0, flex: "2 1 220px" }}><label htmlFor={`sh-pick-${kind}`}>{`${k.label} to share`}</label>
        <select className="select" id={`sh-pick-${kind}`} value={chosen} onChange={(e) => setPick(e.target.value)} disabled={!opts.length}>
          {opts.length ? opts.map((x) => <option key={x.id} value={x.id}>{x.id} — {k.name(x)}</option>) : <option value="">Nothing to add</option>}
        </select></div>
      <button className="btn btn-secondary sm" disabled={!chosen} onClick={share}><Icon name="plus" />Share {k.one}</button>
    </div>
  );
}

/** The "Shared with the auditor" tab: management adds and removes; the auditor reads the same lists, each item linking to its record. */
export function SharedTab({ L, a, canManage }: { L: LayerApi; a: any; canManage: boolean }) {
  const go = useGo();
  const sh = svc.sharedOf(a); const editable = canManage && a.stage !== "Complete";
  const remove = (kind: svc.ShareKind, x: string) => attempt(L, async () => { await svc.setShared(a.id, kind, x, false); L.toast(`${x} is no longer shared`); bumpData(); });
  return (
    <>
      <p className="field help" role="note" style={{ margin: "0 0 12px" }}>The auditor sees only this engagement&apos;s framework and the items shared here, and only while their access is live.</p>
      {svc.SHARE_KINDS.map((kind) => {
        const k = KINDS[kind]; const ids = sh[kind];
        return (
          <section key={kind} aria-labelledby={`sh-h-${kind}`} style={{ marginBottom: 18 }}>
            <div className="sectitle" id={`sh-h-${kind}`}>{k.label} <span className="tag" style={{ marginLeft: 4 }}>{ids.length}</span></div>
            {editable ? <ShareAdd L={L} id={a.id} kind={kind} have={ids} /> : null}
            {ids.length ? (
              <Table cols={[{ t: "ID" }, { t: "Name" }, ...(editable ? [{ t: "" }] : [])]}>
                {ids.map((x) => {
                  const rec = listOf(kind).find((y) => y.id === x); const href = k.path + encodeURIComponent(x);
                  return (
                    <tr key={x}>
                      <td className="strong num">{rec ? <Link href={href} onClick={(e) => { e.preventDefault(); go(href); }}>{x}</Link> : x}</td>
                      <td>{rec ? k.name(rec) : <span style={{ color: "var(--muted)" }}>Not available</span>}</td>
                      {editable ? <td className="r"><button className="btn btn-ghost sm" aria-label={`Stop sharing ${x}`} onClick={() => remove(kind, x)}><Icon name="x" />Remove</button></td> : null}
                    </tr>
                  );
                })}
              </Table>
            ) : <Empty icon={kind === "controls" ? "controls" : kind === "evidence" ? "evidence" : "policies"} title={`No ${k.label.toLowerCase()} shared`}>{canManage ? `Share a ${k.one} for the auditor to review.` : "Management has not shared any yet."}</Empty>}
          </section>
        );
      })}
    </>
  );
}
