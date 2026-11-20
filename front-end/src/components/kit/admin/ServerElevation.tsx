/* Production (API mode) elevation state for the Admin Console screens: read from the server, which is the only control (the database checks it
   again for company changes). The page only disables buttons and explains; an expired elevation turns the page read-only at its expiry time. */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui";
import { useGo } from "@/lib/route";
import { useData } from "@/lib/store";
import { getElevation, type ServerElevation } from "@/services/platform";

export const ELEVATE_TEXT = "Elevate to make changes";
const hm = (ms: number) => new Date(ms).toISOString().slice(11, 16) + " UTC";

export interface ElevationState { el: ServerElevation | null; canElevate: boolean; loaded: boolean; locked: boolean; reload: () => void }
export function useServerElevation(): ElevationState {
  const v = useData();
  const [st, setSt] = useState<{ el: ServerElevation | null; canElevate: boolean; loaded: boolean }>({ el: null, canElevate: false, loaded: false });
  const [now, setNow] = useState(() => Date.now());
  const reload = useCallback(() => { getElevation().then((r) => setSt({ el: r.elevation, canElevate: r.canElevate, loaded: true }), () => setSt({ el: null, canElevate: false, loaded: true })); }, []);
  useEffect(() => { reload(); }, [v, reload]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  const live = !!st.el && st.el.expiresAt > now;
  return { el: live ? st.el : null, canElevate: st.canElevate, loaded: st.loaded, locked: !live, reload };
}

/** Read-only notice while not elevated, or the running elevation's end time. */
export function ServerElevationBanner({ s }: { s: ElevationState }) {
  const go = useGo();
  if (!s.loaded) return null;
  if (s.el) return (
    <div className="banner info" role="status" style={{ flex: "0 0 auto", marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <Icon name="shieldcheck" /><span style={{ flex: "1 1 260px" }}><b>Elevated</b> until {hm(s.el.expiresAt)} (ticket {s.el.ticket}). Every change is recorded in the platform audit log.</span>
    </div>
  );
  return (
    <div className="banner info" role="status" style={{ flex: "0 0 auto", marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <Icon name="shieldcheck" />
      <span style={{ flex: "1 1 260px" }}><b>Read-only.</b> {s.canElevate ? "Changes need an elevated session (reason and ticket recorded, 60 minutes at most)." : "Support accounts browse only; changes are made by elevated platform super admins."}</span>
      {s.canElevate ? <Link href="/admin/elevation" className="btn btn-secondary sm" onClick={(e) => { e.preventDefault(); go("/admin/elevation"); }}>{ELEVATE_TEXT}</Link> : null}
    </div>
  );
}
