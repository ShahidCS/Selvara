import { useState } from "react";
import { Chip, Icon, Segmented, Table } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { LOCKOUT, type LockoutPreset } from "@/lib/accountSecurity";
import { sodMessage } from "@/lib/approvalFlow";
import { clientIp, trustedNets } from "@/lib/ipGuard";
import { useData } from "@/lib/store";
import * as svc from "@/services/team";

/** Company sign-in protection: the account lockout preset and trusted office networks (rules: docs/security/SOD_MATRIX.md section 12). */
export function SignInProtection({ manage }: { manage: boolean }) {
  useData(); const L = useLayer();
  const preset = svc.lockoutPreset();
  const [net, setNet] = useState(""); const [label, setLabel] = useState(""); const [err, setErr] = useState("");
  const pick = async (v: LockoutPreset) => { try { await svc.setLockoutPreset(v); L.toast("Account lockout: " + LOCKOUT[v].label); } catch (e) { L.toast(sodMessage(e, "Could not change the lockout"), false); } };
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    try { await svc.requestTrustedNet(net, label); setNet(""); setLabel(""); L.toast("Requested. A different company admin must approve it"); } catch (x) { setErr(sodMessage(x, "Could not add the network")); }
  };
  const remove = async (id: string) => { try { const n = await svc.removeTrustedNet(id); L.toast(`${n.net} is no longer trusted`); } catch (x) { L.toast(sodMessage(x, "Could not remove the network"), false); } };
  const nets = trustedNets().filter((n) => n.status !== "Removed");
  return (
    <>
      <div className="sectitle" style={{ marginTop: 20 }}>Account lockout</div>
      <p className="field help" style={{ margin: "0 0 8px", maxWidth: "62ch" }}>How many failed sign-ins lock a workspace account, and for how long. {LOCKOUT[preset].note}. Choose PCI DSS v4 if you handle card data. Platform accounts always use Strict.</p>
      {manage ? <Segmented<LockoutPreset> label="Account lockout" value={preset} onChange={pick} options={(Object.keys(LOCKOUT) as LockoutPreset[]).map((k) => ({ value: k, label: LOCKOUT[k].label }))} />
        : <p style={{ margin: 0 }}>{LOCKOUT[preset].label}. Only an admin can change it.</p>}

      <div className="sectitle" style={{ marginTop: 20 }}>Trusted office networks</div>
      <p className="field help" style={{ margin: "0 0 8px", maxWidth: "62ch" }}>Sign-ins from these addresses are never blocked for repeated failures and skip the extra check, so one mistyping script cannot lock out a whole office. Accounts still lock and MFA still applies. Adding a network needs approval from a different company admin; removing one is immediate. Your current address is <span className="num">{clientIp()}</span>.</p>
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
      ) : <p className="field help" style={{ margin: "0 0 8px" }}>No trusted networks.</p>}
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
