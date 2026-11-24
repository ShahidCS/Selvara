import { useState } from "react";
import { Chip, Icon, Segmented, Table, Empty } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { CUSTOM_BOUNDS, LOCKOUT, acct, ruleFor, type LockoutPreset } from "@/lib/accountSecurity";
import { sodMessage } from "@/lib/approvalFlow";
import { clientIp, trustedNets } from "@/lib/ipGuard";
import { useData } from "@/lib/store";
import * as svc from "@/services/team";

/** Company sign-in protection: the account lockout preset and trusted office networks (rules: docs/security/SOD_MATRIX.md section 12). */
export function SignInProtection({ manage }: { manage: boolean }) {
  useData(); const L = useLayer();
  const preset = svc.lockoutPreset();
  const [shown, setShown] = useState<LockoutPreset>(preset);
  const [att, setAtt] = useState(String(acct().custom.attempts)); const [mins, setMins] = useState(String(acct().custom.minutes)); const [cerr, setCerr] = useState("");
  const [net, setNet] = useState(""); const [label, setLabel] = useState(""); const [err, setErr] = useState("");
  const pick = async (v: LockoutPreset) => {
    setShown(v); setCerr(""); if (v === "custom") return; // Custom applies on Save
    try { await svc.setLockoutPreset(v); L.toast("Account lockout: " + LOCKOUT[v].label); } catch (e) { L.toast(sodMessage(e, "Could not change the lockout"), false); }
  };
  const saveCustom = async (e: React.FormEvent) => {
    e.preventDefault(); setCerr("");
    try { await svc.setLockoutPreset("custom", { attempts: Number(att), minutes: Number(mins) }); L.toast("Account lockout: " + ruleFor("custom").note); } catch (x) { setCerr(sodMessage(x, "Could not save the custom lockout")); }
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    try { await svc.requestTrustedNet(net, label); setNet(""); setLabel(""); L.toast("Requested. A different company admin must approve it"); } catch (x) { setErr(sodMessage(x, "Could not add the network")); }
  };
  const remove = async (id: string) => { try { const n = await svc.removeTrustedNet(id); L.toast(`${n.net} is no longer trusted`); } catch (x) { L.toast(sodMessage(x, "Could not remove the network"), false); } };
  const nets = trustedNets().filter((n) => n.status !== "Removed");
  return (
    <>
      <div className="sectitle" style={{ marginTop: 20 }}>Account lockout</div>
      <p className="field help" style={{ margin: "0 0 8px" }}>How many failed sign-ins lock a workspace account, and for how long. Now: {ruleFor(preset).note}. Choose PCI DSS v4 if you handle card data, or Custom to match your regulator or internal policy ({CUSTOM_BOUNDS.attempts[0]} to {CUSTOM_BOUNDS.attempts[1]} attempts, {CUSTOM_BOUNDS.minutes[0]} to {CUSTOM_BOUNDS.minutes[1]} minutes). Platform accounts always use Strict.</p>
      {manage ? <Segmented<LockoutPreset> label="Account lockout" value={shown} onChange={pick} options={[...(Object.keys(LOCKOUT) as LockoutPreset[]).map((k) => ({ value: k, label: LOCKOUT[k as keyof typeof LOCKOUT].label })), { value: "custom" as LockoutPreset, label: "Custom" }]} />
        : <p style={{ margin: 0 }}>{ruleFor(preset).label}. Only an admin can change it.</p>}
      {manage && shown === "custom" ? (
        <form onSubmit={saveCustom} noValidate style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end", marginTop: 8 }}>
          <div className="field" style={{ margin: 0 }}><label htmlFor="lk-att">Failed attempts</label><input className="input num" id="lk-att" type="number" min={CUSTOM_BOUNDS.attempts[0]} max={CUSTOM_BOUNDS.attempts[1]} value={att} onChange={(e) => setAtt(e.target.value)} aria-invalid={!!cerr} aria-describedby={cerr ? "lk-err" : undefined} /></div>
          <div className="field" style={{ margin: 0 }}><label htmlFor="lk-min">Lock for (minutes)</label><input className="input num" id="lk-min" type="number" min={CUSTOM_BOUNDS.minutes[0]} max={CUSTOM_BOUNDS.minutes[1]} value={mins} onChange={(e) => setMins(e.target.value)} aria-invalid={!!cerr} aria-describedby={cerr ? "lk-err" : undefined} /></div>
          <button type="submit" className="btn btn-secondary">Save</button>
        </form>
      ) : null}
      <p className="field help" id="lk-err" role="alert" style={{ color: "var(--bad-ink)", display: cerr ? "block" : "none", marginTop: 6 }}>{cerr}</p>

      <div className="sectitle" style={{ marginTop: 20 }}>Trusted office networks</div>
      <p className="field help" style={{ margin: "0 0 8px" }}>Sign-ins from these addresses are never blocked for repeated failures and skip the extra check, so one mistyping script cannot lock out a whole office. Accounts still lock and MFA still applies. Adding a network needs approval from a different company admin; removing one is immediate. Your current address is <span className="num">{clientIp()}</span>.</p>
      {nets.length ? (
        <Table cols={[{ t: "Network" }, { t: "Office" }, { t: "Status" }, { t: "" }]}>
          {nets.map((n) => (
            <tr key={n.id}>
              <td className="strong num">{n.net}</td><td>{n.label}</td>
              <td>{n.status === "Active" ? <Chip cls="ok" icon="check">Trusted</Chip> : <Chip cls="warn" icon="clock">Awaiting approval</Chip>}</td>
              <td className="r">{manage && n.status === "Active" ? <button className="btn btn-ghost sm" aria-label={`Remove trusted network ${n.net}`} onClick={() => remove(n.id)}><Icon name="x" />Remove</button> : null}</td>
            </tr>
          ))}
        </Table>
      ) : <Empty compact icon="access" title="No trusted networks" />}
      {manage ? (
        <form onSubmit={add} noValidate style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end", marginTop: 8 }}>
          <div className="field" style={{ margin: 0 }}><label htmlFor="tn-net">Address or /24 network</label><input className="input num" id="tn-net" placeholder="203.0.113.0/24" maxLength={18} value={net} onChange={(e) => setNet(e.target.value)} aria-invalid={!!err} aria-describedby={err ? "tn-err" : undefined} /></div>
          <div className="field" style={{ margin: 0 }}><label htmlFor="tn-label">Office</label><input className="input" id="tn-label" maxLength={60} placeholder="Head office" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          <button type="submit" className="btn btn-secondary">Request</button>
        </form>
      ) : null}
      <p className="field help" id="tn-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none", marginTop: 6 }}>{err}</p>
    </>
  );
}
