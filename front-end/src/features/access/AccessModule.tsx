import type { KeyboardEvent } from "react";
import { RecordGrantForm } from "./GrantForms";
import { API_ON } from "@/lib/rbac";
import { Icon, Page } from "@/components/ui";
import { useApp, useData, useModState } from "@/lib/store";
import { ACCESS_REVIEWS } from "@/lib/requests";
import { useLayer } from "@/hooks/useLayer";
import { ACCESS_VIEWS, canActOnAccess } from "@/services/access";
import { AccessRequestForm } from "@/features/work";
import { GrantsTable } from "./GrantsTable";
import { AccessRequests } from "./AccessRequests";
import { AccessReviews } from "./AccessReviews";
import { ReviewForm } from "./ReviewForm";

export default function AccessModule() {
  useData();
  const L = useLayer();
  const role = useApp((s) => s.role);
  const canAct = canActOnAccess(role);
  const [v, setV] = useModState<string>("access.view", "inventory");
  const view = ACCESS_VIEWS.some((x) => x[0] === v) ? v : "inventory"; // never trust stored state blindly
  /* the registers show their own row count; only the reviews view (cards, no table) needs a count here */
  const count = view === "reviews" ? ACCESS_REVIEWS.filter((r) => r.status === "Open").length + " open" : null;
  const tabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const n = e.key === "Home" ? 0 : e.key === "End" ? ACCESS_VIEWS.length - 1 : d ? (i + d + ACCESS_VIEWS.length) % ACCESS_VIEWS.length : -1;
    if (n < 0) return; e.preventDefault();
    setV(ACCESS_VIEWS[n][0]); document.getElementById(`acc-tab-${ACCESS_VIEWS[n][0]}`)?.focus();
  };
  const acts = view === "requests"
    ? <button className="btn btn-primary" onClick={() => L.openModal("Request access", (close) => <AccessRequestForm close={close} />)}><Icon name="plus" />Request access</button>
    : view === "reviews" && canAct
      ? <button className="btn btn-primary" onClick={() => L.openModal("Create access review", (close) => <ReviewForm close={close} />)}><Icon name="plus" />Create access review</button>
      : view === "inventory" && canAct && API_ON
        ? <button className="btn btn-secondary" onClick={() => L.openModal("Record existing access", (close) => <RecordGrantForm close={close} />)}><Icon name="plus" />Record existing access</button>
        : undefined;
  return (
    <Page mod="access" acts={acts}>
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-head">
          <div style={{ maxWidth: "100%", overflowX: "auto", scrollbarWidth: "thin" }}>
            <div className="seg" role="tablist" aria-label="Access views">
              {ACCESS_VIEWS.map((x, i) => <button key={x[0]} id={`acc-tab-${x[0]}`} role="tab" aria-selected={view === x[0]} aria-controls="accBody" tabIndex={view === x[0] ? 0 : -1} style={{ whiteSpace: "nowrap" }} onKeyDown={(e) => tabKey(e, i)} onClick={() => setV(x[0])}>{x[1]}</button>)}
            </div>
          </div>
          {count ? <div className="r"><span className="tag" id="accCount">{count}</span></div> : null}
        </div>
        <div className="c-body flush scroll" style={{ padding: 0 }} id="accBody" role="tabpanel" aria-labelledby={`acc-tab-${view}`}>
          {view === "inventory" ? <GrantsTable /> : view === "requests" ? <AccessRequests canAct={canAct} /> : <AccessReviews canAct={canAct} />}
        </div>
      </div>
    </Page>
  );
}
