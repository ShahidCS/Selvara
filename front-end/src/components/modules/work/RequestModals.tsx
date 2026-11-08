import { useState } from "react";
import { useLayer } from "@/hooks/useLayer";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { getMe, wsLog } from "@/lib/audit";
import { bumpData } from "@/lib/store";
import { nowStamp } from "@/lib/format";
import { ACCESS_REQUESTS, VENDOR_REQS } from "@/lib/requests";
import { setModState } from "@/lib/store";
import { useGo, useRoute } from "@/lib/route";

const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;

/** "Request access" modal (prototype: accRequest / accDoRequest). Pushes onto the Access module's request queue. */
export function AccessRequestForm({ close }: { close: () => void }) {
  const L = useLayer(); const go = useGo(); const route = useRoute();
  const [sys, setSys] = useState(""); const [lvl, setLvl] = useState("Read"); const [user, setUser] = useState(getMe().name); const [reason, setReason] = useState("");
  const [err, setErr] = useState(false);
  const submit = () => {
    const s = sys.trim();
    if (!s) { setErr(true); return; }
    ACCESS_REQUESTS.unshift({ id: "AR-" + String(ACCESS_REQUESTS.length + 3).padStart(2, "0"), user: user.trim() || getMe().name, system: s, level: lvl, reason: reason.trim() || "—", status: "Pending" });
    wsLog("access.requested", s, "Access"); close(); L.toast("Access request submitted");
    setModState("access.view", "requests"); bumpData();
    if (route.mod !== "access") go("/ws/access");
  };
  return (
    <>
      <div>
        <div className="field"><label htmlFor="arq-sys">System <Req /></label><input className="input" id="arq-sys" data-focus placeholder="e.g. Analytics warehouse" value={sys} onChange={(e) => setSys(e.target.value)} aria-invalid={err} aria-describedby={err ? "arq-err" : undefined} /></div>
        <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="field"><label htmlFor="arq-lvl">Level</label><select className="select" id="arq-lvl" value={lvl} onChange={(e) => setLvl(e.target.value)}><option>Read</option><option>Write</option><option>Admin</option></select></div>
          <div className="field"><label htmlFor="arq-user">User</label><input className="input" id="arq-user" value={user} onChange={(e) => setUser(e.target.value)} /></div>
        </div>
        <div className="field"><label htmlFor="arq-reason">Reason</label><input className="input" id="arq-reason" placeholder="Why is this access needed?" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <p className="field help" id="arq-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>System is required.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={submit}>Submit request</button></LayerFoot>
    </>
  );
}

/** "Request a new vendor" modal (prototype: workRequestVendor / workDoReqVendor). */
export function VendorRequestForm({ close }: { close: () => void }) {
  const L = useLayer(); const route = useRoute();
  const [name, setName] = useState(""); const [cat, setCat] = useState(""); const [crit, setCrit] = useState("Medium"); const [reason, setReason] = useState(""); const [data, setData] = useState(false);
  const [err, setErr] = useState(false);
  const submit = () => {
    const n = name.trim(), r = reason.trim();
    if (!n || !r) { setErr(true); return; }
    VENDOR_REQS.unshift({ id: "VR-" + String(VENDOR_REQS.length + 4).padStart(2, "0"), name: n, cat: cat.trim() || "General", reason: r, requester: getMe().name, data, crit, at: nowStamp().slice(0, 10) });
    wsLog("vendor.requested", n + " (" + crit + " tier)", "Vendor"); close(); L.toast("Vendor request submitted to procurement"); bumpData();
    void route;
  };
  return (
    <>
      <p style={{ margin: "0 0 10px", fontSize: 13 }}>Ask Security to assess a new supplier before procurement. Your request enters the vendor review queue.</p>
      <div className="field"><label htmlFor="vr-name">Vendor name <Req /></label><input className="input" id="vr-name" data-focus placeholder="e.g. Northstar Analytics" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="field"><label htmlFor="vr-cat">Category</label><input className="input" id="vr-cat" placeholder="e.g. Analytics" value={cat} onChange={(e) => setCat(e.target.value)} /></div>
        <div className="field"><label htmlFor="vr-crit">Business criticality</label><select className="select" id="vr-crit" value={crit} onChange={(e) => setCrit(e.target.value)}><option>Critical</option><option>Medium</option><option>Low</option></select></div>
      </div>
      <div className="field"><label htmlFor="vr-reason">What will it be used for? <Req /></label><input className="input" id="vr-reason" placeholder="e.g. Marketing attribution" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <label className="listrow" style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}><input type="checkbox" id="vr-data" checked={data} onChange={(e) => setData(e.target.checked)} /> <span>It will process our customer or personal data</span></label>
      <p className="field help" id="vr-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Vendor name and purpose are required.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={submit}>Submit request</button></LayerFoot>
    </>
  );
}
