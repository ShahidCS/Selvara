import { Page } from "@/components/ui";
import { API_ON } from "@/lib/rbac";
import { ApiElevation } from "./ApiElevation";
import { ElevationBanner } from "@/components/kit/admin/ElevationBanner";
import { RequestElevation } from "./RequestElevation";
import { SupportGrants } from "./SupportGrants";

/** Board 8.G1/8.G2: just-in-time elevation and customer-approved support grants. UI state only: the server must enforce every rule. */
function DemoElevationModule() {
  return (
    <Page mod="elevation">
      <div className="scroll" style={{ flex: "1 1 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingRight: 2 }}>
          <ElevationBanner />
          <RequestElevation />
          <SupportGrants />
        </div>
      </div>
    </Page>
  );
}

/** Production (API mode) shows the server's data (slice 3a, decision D4); the demonstration keeps its own screen. */
export default function ElevationModule() { return API_ON ? <ApiElevation /> : <DemoElevationModule />; }
