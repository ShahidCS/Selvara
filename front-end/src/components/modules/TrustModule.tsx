import { useLayer } from "@/hooks/useLayer";
import { modAllowed } from "@/lib/rbac";
import { useApp, useData, useModState } from "@/lib/store";
import TrustAdmin from "./trust/TrustAdmin";
import TrustPublic from "./trust/TrustPublic";

/** Trust Center (source REND.trust + trustCanManage, lines 3326-3442). */
export default function TrustModule() {
  useData();
  const L = useLayer();
  const role = useApp((s) => s.role);
  const [view, setView] = useModState("trust.view", "admin");
  const manage = modAllowed(role, "ws", "trust") && ["super", "admin", "owner"].includes(role.replace(/2$/, ""));
  // External visitors always see the public page; internal roles can toggle a preview
  const showPublic = role === "viewer" || role === "vendor" || view === "public";
  if (showPublic) return <TrustPublic L={L} manage={manage} back={() => setView("admin")} />;
  return <TrustAdmin L={L} setPublic={() => setView("public")} />;
}
