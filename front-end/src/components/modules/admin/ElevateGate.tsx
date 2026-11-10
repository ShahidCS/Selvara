import Link from "next/link";
import { Icon } from "@/components/ui";
import { ELEVATE_TEXT, useElevation } from "@/lib/elevation";
import { useGo } from "@/lib/route";

/** Disable state for admin mutation controls. `title` is the exact text "Elevate to make changes". Display only: services refuse without an elevation too. */
export function useGate(): { locked: boolean; title: string | undefined } {
  const el = useElevation();
  return { locked: !el.active, title: el.active ? undefined : ELEVATE_TEXT };
}

/** Banner shown on admin pages while the session is not elevated: browsing stays read-only and links to the Elevated Access page. */
export function ElevateGateBanner() {
  const el = useElevation(); const go = useGo();
  if (el.active) return null;
  return (
    <div className="banner info" role="status" style={{ flex: "0 0 auto", marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <Icon name="shieldcheck" />
      <span style={{ flex: "1 1 260px" }}><b>Read-only.</b> {el.canElevate ? "Changes need an active elevated session (reason and ticket recorded)." : "Your role cannot make changes here; only elevated platform super admins can."}</span>
      <Link href="/admin/elevation" className="btn btn-secondary sm" onClick={(e) => { e.preventDefault(); go("/admin/elevation"); }}>{ELEVATE_TEXT}</Link>
    </div>
  );
}
