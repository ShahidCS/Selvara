import { Chip, DataTable, Empty, Icon, Page, StatusChip, type DTColumn } from "@/components/ui";
import { useApp, useData, useModState } from "@/lib/store";
import { useLayer } from "@/hooks/useLayer";
import { wsLog } from "@/lib/audit";
import { logSafeUrl } from "@/lib/security";
import * as svc from "@/features/api/services/api";
import { ApprovalsPanel, attempt } from "@/components/kit/sodKit";
import { useGo, useRoute } from "@/lib/route";
import { RevealKeyModal, RevealSecretModal, RevokeKeyForm } from "./ApiModals";
import { API_ON } from "@/lib/rbac";
import { askReason } from "@/components/kit/ReasonDialog";
import { ModuleTip } from "@/components/kit/ModuleTip";
import { NewKeyPage, NewTestPage, NewWebhookPage } from "./ApiForms";

const TABS: [string, string][] = [["Keys", "API keys"], ["Hooks", "Webhooks"], ["Tests", "Custom tests"], ["Stream", "Event stream"]];

/** `/ws/api` is the tabbed register; `/new-key`, `/new-webhook` and `/new-test` are form pages. */
export default function ApiModule() {
  const { param } = useRoute();
  if (param === "new-key") return <NewKeyPage />;
  if (param === "new-webhook") return <NewWebhookPage />;
  if (param === "new-test") return <NewTestPage />;
  return <ApiTabs />;
}

type Key = svc.ApiKey; type Hook = svc.Webhook; type Test = svc.CustomTest; type Ev = svc.ApiEvent;

function ApiTabs() {
  useData();
  const L = useLayer(); const go = useGo();
  const manage = svc.apiCanManage(useApp((s) => s.role));
  const [t, setT] = useModState<string>("api.tab", "Keys");
  const tab = TABS.some((x) => x[0] === t) ? t : "Keys";
  const fail = (m: string) => L.toast(m, false);

  const hookTest = (id: string) => attempt(L, async () => {
    const w = await svc.testWebhook(id); if (!w) return fail("Webhook not found");
    if ("status" in w && !("url" in w)) { L.toast(w.status >= 200 && w.status < 300 ? `Test event delivered · ${w.status} in ${w.ms}ms` : `Test event not delivered: ${w.error || `HTTP ${w.status}`}`, w.status >= 200 && w.status < 300); return; }
    wsLog("webhook.tested", logSafeUrl((w as svc.Webhook).url), "System"); L.toast("Test event sent · 200 OK");
  });
  const hookToggle = (id: string) => attempt(L, async () => { const w = await svc.toggleWebhook(id); if (!w) return fail("Webhook not found"); wsLog("webhook." + (w.status === "Active" ? "resumed" : "paused"), logSafeUrl(w.url), "System"); });
  const hookDelete = (id: string) => API_ON ? askReason(L, { title: "Delete webhook?", label: "", intro: "Nothing more is delivered to this endpoint. A pending approval is withdrawn.", confirm: "Delete webhook", danger: true, run: async () => { await svc.deleteWebhook(id); return "Webhook deleted"; } }) : attempt(L, async () => { const w = await svc.deleteWebhook(id); if (!w) return fail("Webhook not found"); wsLog("webhook.deleted", logSafeUrl(w.url), "System"); L.toast("Webhook deleted"); });
  const testRun = (id: string) => attempt(L, async () => { const x = await svc.runTest(id); if (!x) return fail("Test not found"); wsLog("customtest.run", x.name + ": " + x.result, "Control"); L.toast(x.name + " → " + x.result); });
  const testDelete = (id: string) => API_ON ? askReason(L, { title: "Delete custom test?", label: "", confirm: "Delete test", danger: true, run: async () => { await svc.deleteTest(id); return "Custom test deleted"; } }) : attempt(L, async () => { const x = await svc.deleteTest(id); if (!x) return fail("Test not found"); wsLog("customtest.deleted", x.name, "Control"); L.toast("Custom test deleted"); });
  const push = () => attempt(L, async () => { const s = await svc.pushTestEvent(); wsLog("api.event.pushed", s[0] + " " + s[1], "System"); L.toast("Event pushed · 200 OK"); });

  const keyCols: DTColumn<Key>[] = [
    { key: "label", header: "Label", value: (k) => k.label, locked: true, render: (k) => <span className="strong">{k.label}</span> },
    { key: "prefix", header: "Prefix", value: (k) => k.prefix, render: (k) => <span className="num">{k.prefix}</span> },
    { key: "scope", header: "Scope", value: (k) => k.scope, render: (k) => k.scope },
    { key: "created", header: "Created", value: (k) => k.created, render: (k) => k.created },
    { key: "last", header: "Last used", value: (k) => k.lastUsed, render: (k) => <span style={{ color: "var(--muted)" }}>{k.lastUsed}{k.uses ? ` · ${k.uses} calls` : ""}</span> },
    ...(API_ON ? [{ key: "expires", header: "Expires", value: (k: Key) => k.expires || "", render: (k: Key) => <span style={{ color: "var(--muted)" }}>{k.expires}</span> }] : []),
    { key: "status", header: "Status", value: (k) => k.status, render: (k) => (k.status === "Active" ? <Chip cls="ok" icon="check">Active</Chip> : k.status === "Pending approval" ? <Chip cls="warn" icon="clock">Pending approval</Chip> : k.status === "Not approved" ? <Chip cls="neutral" icon="x">Not approved</Chip> : k.status === "Approved, not yet issued" ? <Chip cls="warn" icon="clock">Approved, not yet issued</Chip> : k.status === "Expired" ? <Chip cls="neutral" icon="clock">Expired</Chip> : <Chip cls="bad" icon="x">Revoked</Chip>) },
    { key: "act", header: "Actions", hideHeader: true, align: "end", locked: true, render: (k) => (manage ? (
      <div className="btngrp" style={{ justifyContent: "flex-end" }}>
        {svc.keyRevealable(k.id) ? <button className="btn btn-primary sm" aria-label={`Reveal key ${k.label} once`} onClick={() => L.openModal("Your new API key", (close) => <RevealKeyModal id={k.id} close={close} />)}><Icon name="access" />Show key once</button> : null}
        {k.status === "Active" ? <button className="btn btn-ghost sm" aria-label={`Revoke ${k.label}`} onClick={() => L.openModal("Revoke API key?", (close) => <RevokeKeyForm id={k.id} close={close} />)}><Icon name="x" />Revoke</button> : null}
      </div>
    ) : null) },
  ];
  const hookCols: DTColumn<Hook>[] = [
    { key: "url", header: "Endpoint", value: (w) => w.url, locked: true, render: (w) => <span className="num">{w.url}</span> },
    { key: "events", header: "Events", value: (w) => w.events.join(" "), render: (w) => <>{w.events.map((e) => <span key={e} className="tag num" style={{ margin: "1px 2px 1px 0" }}>{e}</span>)}</> },
    { key: "sig", header: "Signature", value: () => "HMAC-SHA256", render: () => <span className="num">HMAC-SHA256</span> },
    { key: "last", header: "Last delivery", value: (w) => w.lastDelivery || "", render: (w) => <span style={{ color: "var(--muted)" }}>{w.lastDelivery || "—"}{w.failures ? <div style={{ color: "var(--bad-ink)", fontSize: 11.5 }}>{w.failures} failed in a row</div> : null}</span> },
    { key: "status", header: "Status", value: (w) => w.status, render: (w) => (w.status === "Active" ? <Chip cls="ok" icon="check">Active</Chip> : w.status === "Pending approval" ? <Chip cls="warn" icon="clock">Pending approval</Chip> : w.status === "Not approved" ? <Chip cls="neutral" icon="x">Not approved</Chip> : <Chip cls="neutral" icon="dot">Paused</Chip>) },
    { key: "act", header: "Actions", hideHeader: true, align: "end", locked: true, render: (w) => (manage ? (
      <div className="btngrp" style={{ justifyContent: "flex-end" }}>
        {w.secretRevealable ? <button className="btn btn-primary sm" aria-label={`Show signing secret of ${w.url} once`} onClick={() => L.openModal("Webhook signing secret", (close) => <RevealSecretModal id={w.id} close={close} />)}><Icon name="access" />Show secret once</button> : null}
        <button className="btn btn-ghost sm" disabled={API_ON ? w.status !== "Active" : w.status !== "Active" && w.status !== "Paused"} title={w.status === "Active" || w.status === "Paused" ? undefined : "Needs approval from a second admin"} aria-label={`Send test event to ${w.url}`} onClick={() => hookTest(w.id)}><Icon name="refresh" />Test</button>
        <button className="btn btn-ghost sm" disabled={w.status !== "Active" && w.status !== "Paused"} title={w.status === "Active" || w.status === "Paused" ? undefined : "Needs approval from a second admin"} onClick={() => hookToggle(w.id)}>{w.status === "Active" ? "Pause" : "Resume"}</button>
        <button className="btn btn-ghost sm" aria-label={`Delete webhook ${w.url}`} onClick={() => hookDelete(w.id)}><Icon name="x" /></button>
      </div>
    ) : null) },
  ];
  const testCols: DTColumn<Test>[] = [
    { key: "name", header: "Custom test", value: (x) => x.name, locked: true, render: (x) => <span className="strong">{x.name}</span> },
    { key: "target", header: "Target", value: (x) => x.target, render: (x) => x.target },
    { key: "sched", header: "Schedule", value: (x) => x.schedule, render: (x) => <span style={{ color: "var(--muted)" }}>{x.schedule}</span> },
    { key: "last", header: "Last run", value: (x) => x.last, render: (x) => <span style={{ color: "var(--muted)" }}>{x.last}</span> },
    { key: "result", header: "Result", value: (x) => x.result, render: (x) => <StatusChip s={x.result} /> },
    { key: "act", header: "Actions", hideHeader: true, align: "end", locked: true, render: (x) => (manage ? (
      <div className="btngrp" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-ghost sm" aria-label={`Run ${x.name} now`} onClick={() => testRun(x.id)}><Icon name="refresh" />Run now</button>
        <button className="btn btn-ghost sm" aria-label={`Delete ${x.name}`} onClick={() => testDelete(x.id)}><Icon name="x" /></button>
      </div>
    ) : null) },
  ];
  const evCols: DTColumn<Ev>[] = [
    { key: "ev", header: "Event", value: (r) => r.ev, locked: true, render: (r) => <span className="num">{r.ev}</span> },
    { key: "res", header: "Resource", value: (r) => r.res, render: (r) => <span className="num">{r.res}</span> },
    ...(API_ON ? [{ key: "dir", header: "Direction", value: (r: Ev) => r.dir || "", render: (r: Ev) => (r.dir === "Out" ? "Delivered to webhook" : "Pushed to Selvara") }] : []),
    { key: "http", header: "HTTP", value: (r) => r.http, render: (r) => (/^2\d\d$/.test(r.http) ? <Chip cls="ok" icon="check">{r.http}</Chip> : <Chip cls="bad" icon="x">{r.http}</Chip>) },
    ...(API_ON ? [{ key: "detail", header: "Detail", value: (r: Ev) => r.detail || "", render: (r: Ev) => <span style={{ color: "var(--muted)", fontSize: 12 }}>{r.detail}</span> }] : []),
    { key: "lat", header: "Latency", value: (r) => r.lat, render: (r) => <span className="num">{r.lat}</span> },
    { key: "when", header: "When", value: (r) => r.when, render: (r) => <span style={{ color: "var(--muted)" }}>{r.when}</span> },
  ];
  const acts = manage ? (
    tab === "Keys" ? <button className="btn btn-primary" onClick={() => go("/ws/api/new-key")}><Icon name="plus" />New API key</button>
    : tab === "Hooks" ? <button className="btn btn-primary" onClick={() => go("/ws/api/new-webhook")}><Icon name="plus" />Add webhook</button>
    : tab === "Tests" ? <button className="btn btn-primary" onClick={() => go("/ws/api/new-test")}><Icon name="plus" />New custom test</button>
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
          <div style={{ padding: "12px 12px 0" }}><ModuleTip mod="api" /></div>
          {tab === "Keys" || tab === "Hooks" ? <div style={{ padding: "12px 12px 0" }}><ApprovalsPanel prefix="api." title="API approvals (second admin)" /></div> : null}
          {tab === "Keys" ? (
            <DataTable<Key> id="api-keys" label="API keys" rows={svc.API.keys} rowKey={(k) => k.id} columns={keyCols} searchText={(k) => `${k.label} ${k.prefix} ${k.scope}`}
              tabs={["Active", "Pending approval", ...(API_ON ? ["Approved, not yet issued", "Expired"] : []), "Not approved", "Revoked"].map((st) => ({ key: st, label: st, match: (k: Key) => k.status === st }))} exportName="api-keys" />
          ) : tab === "Hooks" ? (
            svc.API.hooks.length ? (
              <DataTable<Hook> id="webhooks" label="Webhooks" rows={svc.API.hooks} rowKey={(w) => w.id} columns={hookCols} searchText={(w) => `${w.url} ${w.events.join(" ")}`}
                tabs={["Active", "Paused", "Pending approval", "Not approved"].map((st) => ({ key: st, label: st, match: (w: Hook) => w.status === st }))} exportName="webhooks" />
            ) : <Empty icon="ext" title="No webhooks">Add an endpoint to receive signed events.</Empty>
          ) : tab === "Tests" ? (
            <DataTable<Test> id="custom-tests" label="Custom tests" rows={svc.API.tests} rowKey={(x) => x.id} columns={testCols} searchText={(x) => `${x.name} ${x.target}`} exportName="custom-tests" />
          ) : (
            <>
              <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--muted)" }}>{API_ON ? "Events your systems pushed to Selvara (POST /api/v1/events with a read/write key) and deliveries to your webhooks, newest first:" : "Push API: private resources can be pushed to Selvara over the event stream for custom tests. Recent deliveries:"}</div>
              <DataTable<Ev> id="api-events" label="Event stream" rows={svc.API.events} rowKey={(r) => r.id ?? `${r.ev}|${r.res}|${r.when}`} columns={evCols} searchText={(r) => `${r.ev} ${r.res}`} exportName="api-events" />
            </>
          )}
        </div>
      </div>
    </Page>
  );
}
