import { Empty, Page } from "@/components/ui";
import { modAllowed } from "@/lib/rbac";
import { useApp } from "@/lib/store";
import { ElevationBanner } from "@/components/kit/admin/ElevationBanner";
import { PlatformSecurity } from "./PlatformSecurity";

/** Board 8.G7: read-only platform security rules. Deny by default for roles without the module. */
export default function PlatformSecurityModule() {
  const role = useApp((s) => s.role);
  if (!modAllowed(role, "admin", "security")) return <Page mod="security"><Empty icon="shieldcheck" title="Not available">Your role cannot view this page.</Empty></Page>;
  return (
    <Page mod="security">
      <div className="scroll" style={{ flex: "1 1 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingRight: 2 }}>
          <ElevationBanner />
          <PlatformSecurity />
        </div>
      </div>
    </Page>
  );
}
