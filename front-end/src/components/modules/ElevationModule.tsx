import { Page } from "@/components/ui";
import { ElevationBanner } from "./admin/ElevationBanner";
import { RequestElevation } from "./admin/RequestElevation";
import { SupportGrants } from "./admin/SupportGrants";

/** Board 8.G1/8.G2: just-in-time elevation and customer-approved support grants. UI state only: the server must enforce every rule. */
export default function ElevationModule() {
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
