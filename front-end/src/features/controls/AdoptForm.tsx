import { useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui";
import { MemberSelect, myMemberId, useMembers } from "@/components/kit/MemberSelect";
import { useLayer } from "@/hooks/useLayer";
import { DATA, FW_SHORT } from "@/lib/data";
import { uiMessage } from "@/lib/grcSod";
import { wsMeta } from "@/services/ws";
import * as svc from "./services/controls";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Production: adopt controls from the shared library. Each becomes the company's own control (status "Needs evidence"), owned by the member
 *  chosen here, with the library's framework mappings (those that name a catalogue requirement count towards readiness). */
export function AdoptForm({ close }: { close: () => void }) {
  const L = useLayer(); const members = useMembers();
  const lib = useSyncExternalStore(wsMeta.subscribe, () => wsMeta.get().library, () => wsMeta.get().library) as any[];
  const have = new Set(DATA.controls.map((c) => c.id));
  const open = lib.filter((c) => !have.has(c.id));
  const [pick, setPick] = useState<Set<string>>(new Set()); const [owner, setOwner] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const ownerId = owner || myMemberId(members);
  const flip = (id: string) => setPick((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const all = open.length > 0 && pick.size === open.length;
  const save = async () => {
    if (busy || !pick.size) return; setBusy(true);
    try { const r = await svc.adoptControls([...pick], ownerId); close(); L.toast(`${r.added.length} control${r.added.length === 1 ? "" : "s"} adopted`); }
    catch (e) { setErr(uiMessage(e)); setBusy(false); }
  };
  if (!open.length) return <p style={{ margin: 0 }}>Every control in the library is already in your register.</p>;
  return (
    <>
      <p className="field help" style={{ marginTop: 0 }}>Choose the controls you run. Each starts as &ldquo;Needs evidence&rdquo; until its owner attests or a test passes. Their framework mappings come with them; review them before relying on them.</p>
      <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "0 0 6px" }}><input type="checkbox" checked={all} onChange={() => setPick(all ? new Set() : new Set(open.map((c) => c.id)))} />Select all ({open.length})</label>
      <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid var(--line)", borderRadius: 8 }}>
        {open.map((c) => (
          <label key={c.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", borderBottom: "1px solid var(--line)" }}>
            <input type="checkbox" checked={pick.has(c.id)} onChange={() => flip(c.id)} style={{ marginTop: 3 }} />
            <span style={{ minWidth: 0 }}><span className="tag num">{c.id}</span> <span className="strong">{c.title}</span><br />
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{c.domain} · {Object.keys(c.map || {}).map((k) => FW_SHORT[k] || k).slice(0, 6).join(", ") || "No mappings"}</span></span>
          </label>
        ))}
      </div>
      <MemberSelect id="ad-owner" value={ownerId} onChange={setOwner} help="You can change each control's owner later." />
      <p className="field help" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <div className="btngrp" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button className="btn btn-secondary" onClick={close}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !pick.size} onClick={save}><Icon name="plus" />Adopt {pick.size || ""} control{pick.size === 1 ? "" : "s"}</button>
      </div>
    </>
  );
}
