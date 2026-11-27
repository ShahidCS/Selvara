import { useState } from "react";
import { Chip, Empty, Icon, Table } from "@/components/ui";
import { askReason } from "@/components/kit/ReasonDialog";
import { useLayer } from "@/hooks/useLayer";
import { sodMessage } from "@/lib/approvalFlow";
import { useData } from "@/lib/store";
import * as gov from "./services/governance";

const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
const STATUS: Record<gov.RuleStatus, [string, string]> = { Draft: ["neutral", "dot"], "Pending approval": ["warn", "clock"], Active: ["ok", "check"], Paused: ["neutral", "dot"] };

/** Automation rules (DRAFT for review): when something happens, do one safe thing. Turning a rule on is four-eyes; pausing is immediate. */
export function RulesTab({ manage }: { manage: boolean }) {
  useData(); const L = useLayer();
  const [name, setName] = useState(""); const [trig, setTrig] = useState<string>(gov.TRIGGERS[0].id); const [act, setAct] = useState<string>(gov.ACTIONS[0].id); const [err, setErr] = useState("");
  const create = (e: React.FormEvent) => { e.preventDefault(); setErr(""); try { gov.createRule({ name, trigger: trig, action: act }); setName(""); L.toast("Rule saved as a draft"); } catch (x) { setErr(sodMessage(x, "Could not save the rule")); document.getElementById("rl-name")?.focus(); } };
  const act1 = (fn: () => unknown, ok: string) => { try { fn(); L.toast(ok); } catch (x) { L.toast(sodMessage(x, "Could not do that"), false); } };
  return (
    <div style={{ maxWidth: 900, display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="banner warn" style={{ margin: 0 }}><b>Draft for review.</b> Rules act on their own, so they are limited: they only notify an owner or open an issue, never approve, delete, publish or change access; each run does at most {gov.RULE_LIMITS.MAX_ACTIONS_PER_RUN} actions and every action is audited. A different company admin must approve turning a rule on. In production rules run as a server job; here you run them by hand.</div>
      {manage ? (
        <form onSubmit={create} noValidate style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 8, alignItems: "end" }}>
          <div className="field" style={{ margin: 0 }}><label htmlFor="rl-name">Rule name</label><input className="input" id="rl-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!err} aria-describedby={err ? "rl-err" : undefined} placeholder="Failing controls get an issue" /></div>
          <div className="field" style={{ margin: 0 }}><label htmlFor="rl-trig">When</label><select className="select" id="rl-trig" value={trig} onChange={(e) => setTrig(e.target.value)}>{gov.TRIGGERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
          <div className="field" style={{ margin: 0 }}><label htmlFor="rl-act">Then</label><select className="select" id="rl-act" value={act} onChange={(e) => setAct(e.target.value)}>{gov.ACTIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
          <button type="submit" className="btn btn-secondary" style={{ justifySelf: "start" }}>Save draft</button>
        </form>
      ) : <p className="field help" style={{ margin: 0 }}>Read-only for your role.</p>}
      <p className="field help" id="rl-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none", margin: 0 }}>{err}</p>
      {gov.RULES.length === 0 ? <Empty icon="auto" title="No rules yet">{manage ? "Save a rule as a draft above, then ask a different company admin to turn it on." : "An admin has not set up any automation rules."}</Empty> : (
        <Table cols={[{ t: "Rule" }, { t: "When → then" }, { t: "Status" }, { t: "Last run" }, { t: "" }]}>
          {gov.RULES.map((r) => {
            const [cls, icon] = STATUS[r.status]; const last = r.runs[0];
            return (
              <tr key={r.id}>
                <td className="strong">{r.name}<div style={{ fontSize: ".71875rem", color: "var(--muted)", fontWeight: 400 }}>{r.id} · by {r.createdBy}{r.approvedBy ? ` · approved by ${r.approvedBy}` : ""}</div></td>
                <td style={{ fontSize: ".78125rem" }}>{gov.triggerLabel(r.trigger)} → {gov.actionLabel(r.action).toLowerCase()}</td>
                <td><Chip cls={cls} icon={icon}>{r.status}</Chip></td>
                <td style={{ fontSize: ".75rem" }}>{last ? `${fmt(last.at)}: ${last.acted} of ${last.matched}${last.capped ? " (capped)" : ""}` : "Never"}</td>
                <td className="r">{manage ? (
                  <div className="btngrp" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button className="btn btn-ghost sm" aria-label={`Preview: ${r.name}`} onClick={() => L.openModal(`Preview: ${r.name}`, <Preview id={r.id} />)}>Preview</button>
                    {r.status === "Draft" || r.status === "Paused" ? <button className="btn btn-ghost sm" aria-label={`Turn on: ${r.name}`} onClick={() => L.openModal(`Turn on: ${r.name}`, (close) => <Reason close={close} label="Request approval" run={(why) => { gov.requestEnable(r.id, why); L.toast("A different company admin must approve turning it on"); }} />)}>Turn on</button> : null}
                    {r.status === "Active" ? <><button className="btn btn-ghost sm" aria-label={`Run now: ${r.name}`} onClick={() => act1(() => { const x = gov.runRule(r.id); L.toast(`${x.acted} action${x.acted === 1 ? "" : "s"} taken`); }, "Rule ran")}><Icon name="play" />Run now</button>
                      <button className="btn btn-ghost sm" aria-label={`Pause: ${r.name}`} onClick={() => act1(() => gov.pauseRule(r.id), "Rule paused")}>Pause</button></> : null}
                    {r.status !== "Active" && r.status !== "Pending approval" ? <button className="btn btn-ghost sm" aria-label={`Delete rule: ${r.name}`} title="Delete rule" onClick={() => askReason(L, { title: `Delete rule: ${r.name}?`, label: "", danger: true, confirm: "Delete rule", intro: "The rule is removed and will not run again.", run: async () => { gov.deleteRule(r.id); return "Rule deleted"; } })}><Icon name="trash" /></button> : null}
                  </div>
                ) : null}</td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}

function Preview({ id }: { id: string }) {
  const p = gov.previewRule(id);
  return (
    <>
      <p style={{ margin: "0 0 8px", fontSize: ".8125rem" }}>{p.matches.length ? `It would act on ${p.matches.length} record${p.matches.length === 1 ? "" : "s"} now${p.capped ? `, ${gov.RULE_LIMITS.MAX_ACTIONS_PER_RUN} per run` : ""}. Nothing is changed by a preview.` : "Nothing matches now."}</p>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: ".8125rem", maxHeight: 240, overflow: "auto" }}>{p.matches.map((m) => <li key={m.id}>{m.id}: {m.title} ({m.owner})</li>)}</ul>
    </>
  );
}

/** A reason (at least 10 characters), then the action. Errors stay in the dialog. */
export function Reason({ close, label, run, danger, extra }: { close: () => void; label: string; run: (why: string) => void; danger?: boolean; extra?: React.ReactNode }) {
  const [why, setWhy] = useState(""); const [err, setErr] = useState("");
  const go = () => { setErr(""); try { run(why); close(); } catch (x) { setErr(sodMessage(x, "Could not do that")); } };
  return (
    <>
      {extra}
      <div className="field"><label htmlFor="gv-why">Reason (at least 10 characters)</label><textarea className="input" id="gv-why" data-focus rows={3} maxLength={300} style={{ resize: "vertical" }} value={why} onChange={(e) => { setWhy(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby={err ? "gv-err" : undefined} /></div>
      <p className="field help" id="gv-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <div className="btngrp" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}><button className="btn btn-secondary" onClick={close}>Cancel</button><button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={go}>{label}</button></div>
    </>
  );
}
