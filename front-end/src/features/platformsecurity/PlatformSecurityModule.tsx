import { Empty, Page } from "@/components/ui";
import { API_ON, modAllowed } from "@/lib/rbac";
import { ServerElevationBanner, useServerElevation } from "@/components/kit/admin/ServerElevation";
import { ApiBlocks } from "./ApiBlocks";
import { useApp } from "@/lib/store";
import { ElevationBanner } from "@/components/kit/admin/ElevationBanner";
import { PlatformSecurity } from "./PlatformSecurity";
import { BlockedAddresses } from "./BlockedAddresses";

/** Board 8.G7: read-only platform security rules. Deny by default for roles without the module. */
export default function PlatformSecurityModule() {
  const role = useApp((s) => s.role);
  if (!modAllowed(role, "admin", "security")) return <Page mod="security"><Empty icon="shieldcheck" title="Not available">Your role cannot view this page.</Empty></Page>;
  return (
    <Page mod="security">
      <div className="scroll" style={{ flex: "1 1 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingRight: 2 }}>
          {API_ON ? <ApiSection /> : <><ElevationBanner /><BlockedAddresses /></>}
          <PlatformSecurity />
        </div>
      </div>
    </Page>
  );
}

/** Production: the server's elevation state and its sign-in blocks. */
function ApiSection() { const s = useServerElevation(); return <><ServerElevationBanner s={s} /><ApiBlocks s={s} /></>; }
