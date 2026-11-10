import { Chip, Empty, Icon, Page, StatusChip, Table } from "@/components/ui";
import { useApp, useData, useModState } from "@/lib/store";
import { useLayer } from "@/hooks/useLayer";
import { wsLog } from "@/lib/audit";
import { logSafeUrl } from "@/lib/security";
import * as svc from "@/services/api";
import { ApprovalsPanel, attempt } from "../kit/sodKit";
import { NewKeyForm, RevealKeyModal, RevokeKeyForm, TestForm, WebhookForm } from "./api/ApiModals";

const TABS: [string, string][] = [["Keys", "API keys"], ["Hooks", "Webhooks"], ["Tests", "Custom tests"], ["Stream", "Event stream"]];

export default function ApiModule() {
  useData();
  const L = useLayer();
  const manage = svc.apiCanManage(useApp((s) => s.role));
  const [t, setT] = useModState<string>("api.tab", "Keys");
  const tab = TABS.some((x) => x[0] === t) ? t : "Keys";
  const fail = (m: string) => L.toast(m, false);

  const hookTest = (id: string) => attempt(L, async () => { const w = await svc.testWebhook(id); if (!w) return fail("Webhook not found"); wsLog("webhook.tested", logSafeUrl(w.url), "System"); L.toast("Test event sent · 200 OK"); });
  const hookToggle = (id: string) => attempt(L, async () => { const w = await svc.toggleWebhook(id); if (!w) return fail("Webhook not found"); wsLog("webhook." + (w.status === "Active" ? "resumed" : "paused"), logSafeUrl(w.url), "System"); });
  const hookDelete = (id: string) => attempt(L, async () => { const w = await svc.deleteWebhook(id); if (!w) return fail("Webhook not found"); wsLog("webhook.deleted", logSafeUrl(w.url), "System"); L.toast("Webhook deleted"); });
  const testRun = (id: string) => attempt(L, async () => { const x = await svc.runTest(id); if (!x) return fail("Test not found"); wsLog("customtest.run", x.name + ": " + x.result, "Control"); L.toast(x.name + " → " + x.result); });
  const testDelete = (id: string) => attempt(L, async () => { const x = await svc.deleteTest(id); if (!x) return fail("Test not found"); wsLog("customtest.deleted", x.name, "Control"); L.toast("Custom test deleted"); });
  const push = () => attempt(L, async () => { const s = await svc.pushTestEvent(); wsLog("api.event.pushed", s[0] + " " + s[1], "System"); L.toast("Event pushed · 200 OK"); });

  const acts = manage ? (
    tab === "Keys" ? <button className="btn btn-primary" onClick={() => L.openModal("New API key", (close) => <NewKeyForm close={close} />)}><Icon name="plus" />New API key</button>
    : tab === "Hooks" ? <button className="btn btn-primary" onClick={() => L.openModal("Add webhook", (close) => <WebhookForm close={close} />)}><Icon name="plus" />Add webhook</button>
    : tab === "Tests" ? <button className="btn btn-primary" onClick={() => L.openModal("New custom test", (close) => <TestForm close={close} />)}><Icon name="plus" />New custom test</button>
    : <button className="btn btn-secondary" onClick={push}><Icon name="refresh" />Push test event</button>
  ) : undefined;

  return (
    <Page mod="api" acts={acts}>
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-head" style={{ padding: "0 8px" }}>
          <div className="tabs" role="tablist">
            {TABS.map((x) => <button key={x[0]} className="tab" role="tab" aria-selected={tab === x[0]} onClick={() => setT(x[0])}>{x[1]}</button>)}
          </div>
        </div>
        <div className="c-body flush scroll" style={{ padding: 0 }} id="apiBody">
          {tab === "Keys" || tab === "Hooks" ? <div style={{ padding: "12px 12px 0" }}><ApprovalsPanel prefix="api." title="API approvals (second admin)" /></div> : null}
          {tab === "Keys" ? (
            <Table minw={880} cols={[{ t: "Label" }, { t: "Prefix" }, { t: "Scope" }, { t: "Created" }, { t: "Last used" }, { t: "Status" }, { t: "" }]}>
              {svc.API.keys.map((k) => (
                <tr key={k.id}>
                  <td className="strong">{k.label}</td><td className="num">{k.prefix}</td><td>{k.scope}</td><td>{k.created}</td><td style={{ color: "var(--muted)" }}>{k.lastUsed}</td>
                  <td>{k.status === "Active" ? <Chip cls="ok" icon="check">Active</Chip> : k.status === "Pending approval" ? <Chip cls="warn" icon="clock">Pending approval</Chip> : k.status === "Not approved" ? <Chip cls="neutral" icon="x">Not approved</Chip> : <Chip cls="bad" icon="x">Revoked</Chip>}</td>
                  <td className="r">{manage ? (
                    <div className="btngrp" style={{ justifyContent: "flex-end" }}>
                      {svc.keyRevealable(k.id) ? <button className="btn btn-primary sm" aria-label={`Reveal key ${k.label} once`} onClick={() => L.openModal("Your new API key", (close) => <RevealKeyModal id={k.id} close={close} />)}><Icon name="access" />Show key once</button> : null}
                      {k.status === "Active" ? <button className="btn btn-ghost sm" aria-label={`Revoke ${k.label}`} onClick={() => L.openModal("Revoke API key?", (close) => <RevokeKeyForm id={k.id} close={close} />)}><Icon name="x" />Revoke</button> : null}
                    </div>
                  ) : null}</td>
                </tr>
              ))}
            </Table>
          ) : tab === "Hooks" ? (
            svc.API.hooks.length ? (
              <Table minw={920} cols={[{ t: "Endpoint" }, { t: "Events" }, { t: "Signature" }, { t: "Last delivery" }, { t: "Status" }, { t: "" }]}>
                {svc.API.hooks.map((w) => (
                  <tr key={w.id}>
                    <td className="num">{w.url}</td>
                    <td>{w.events.map((e) => <span key={e} className="tag num" style={{ margin: "1px 2px 1px 0" }}>{e}</span>)}</td>
                    <td className="num">HMAC-SHA256</td><td style={{ color: "var(--muted)" }}>{w.lastDelivery || "—"}</td>
                    <td>{w.status === "Active" ? <Chip cls="ok" icon="check">Active</Chip> : w.status === "Pending approval" ? <Chip cls="warn" icon="clock">Pending approval</Chip> : w.status === "Not approved" ? <Chip cls="neutral" icon="x">Not approved</Chip> : <Chip cls="neutral" icon="dot">Paused</Chip>}</td>
                    <td className="r">{manage ? (
                      <div className="btngrp" style={{ justifyContent: "flex-end" }}>
                        <button className="btn btn-ghost sm" disabled={w.status !== "Active" && w.status !== "Paused"} title={w.status === "Active" || w.status === "Paused" ? undefined : "Needs approval from a second admin"} aria-label={`Send test event to ${w.url}`} onClick={() => hookTest(w.id)}><Icon name="refresh" />Test</button>
                        <button className="btn btn-ghost sm" disabled={w.status !== "Active" && w.status !== "Paused"} title={w.status === "Active" || w.status === "Paused" ? undefined : "Needs approval from a second admin"} onClick={() => hookToggle(w.id)}>{w.status === "Active" ? "Pause" : "Resume"}</button>
                        <button className="btn btn-ghost sm" aria-label={`Delete webhook ${w.url}`} onClick={() => hookDelete(w.id)}><Icon name="x" /></button>
                      </div>
                    ) : null}</td>
                  </tr>
                ))}
              </Table>
            ) : <Empty icon="ext" title="No webhooks">Add an endpoint to receive signed events.</Empty>
          ) : tab === "Tests" ? (
            <Table minw={840} cols={[{ t: "Custom test" }, { t: "Target" }, { t: "Schedule" }, { t: "Last run" }, { t: "Result" }, { t: "" }]}>
              {svc.API.tests.map((x) => (
                <tr key={x.id}>
                  <td className="strong">{x.name}</td><td>{x.target}</td><td style={{ color: "var(--muted)" }}>{x.schedule}</td><td style={{ color: "var(--muted)" }}>{x.last}</td>
                  <td><StatusChip s={x.result} /></td>
                  <td className="r">{manage ? (
                    <div className="btngrp" style={{ justifyContent: "flex-end" }}>
                      <button className="btn btn-ghost sm" aria-label={`Run ${x.name} now`} onClick={() => testRun(x.id)}><Icon name="refresh" />Run now</button>
                      <button className="btn btn-ghost sm" aria-label={`Delete ${x.name}`} onClick={() => testDelete(x.id)}><Icon name="x" /></button>
                    </div>
                  ) : null}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <>
              <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--muted)" }}>Push API: private resources can be pushed to Selvara over the event stream for custom tests. Recent deliveries:</div>
              <Table minw={780} cols={[{ t: "Event" }, { t: "Resource" }, { t: "HTTP" }, { t: "Latency" }, { t: "When" }]}>
                {svc.API.events.map((r, i) => (
                  <tr key={i}><td className="num">{r.ev}</td><td className="num">{r.res}</td><td><Chip cls="ok" icon="check">{r.http}</Chip></td><td className="num">{r.lat}</td><td style={{ color: "var(--muted)" }}>{r.when}</td></tr>
                ))}
              </Table>
            </>
          )}
        </div>
      </div>
    </Page>
  );
}
