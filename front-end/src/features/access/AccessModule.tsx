import { Icon, Page } from "@/components/ui";
import { DATA } from "@/lib/data";
import { useApp, useData, useModState } from "@/lib/store";
import { ACCESS_REQUESTS, ACCESS_REVIEWS } from "@/lib/requests";
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
  const count = view === "inventory" ? DATA.access.length + " grants"
    : view === "requests" ? ACCESS_REQUESTS.filter((r) => r.status === "Pending").length + " pending"
    : ACCESS_REVIEWS.filter((r) => r.status === "Open").length + " open";
  const acts = view === "requests"
    ? <button className="btn btn-primary" onClick={() => L.openModal("Request access", (close) => <AccessRequestForm close={close} />)}><Icon name="plus" />Request access</button>
    : view === "reviews" && canAct
      ? <button className="btn btn-primary" onClick={() => L.openModal("Create access review", (close) => <ReviewForm close={close} />)}><Icon name="plus" />Create access review</button>
      : undefined;
  return (
    <Page mod="access" acts={acts}>
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-head">
          <div className="seg" role="tablist">
            {ACCESS_VIEWS.map((x) => <button key={x[0]} role="tab" aria-selected={view === x[0]} onClick={() => setV(x[0])}>{x[1]}</button>)}
          </div>
          <div className="r"><span className="tag" id="accCount">{count}</span></div>
        </div>
        <div className="c-body flush scroll" style={{ padding: 0 }} id="accBody">
          {view === "inventory" ? <GrantsTable /> : view === "requests" ? <AccessRequests canAct={canAct} /> : <AccessReviews canAct={canAct} />}
        </div>
      </div>
    </Page>
  );
}
