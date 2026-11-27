/* Bottom tab bar on phones (reference review R5). Below the phone breakpoint the four places people open most sit at the bottom of the
   screen, within thumb reach, and "More" opens the full menu (the sidebar drawer). Only modules the role can open are offered (display only:
   every route and service still checks the role). Above the breakpoint the bar is not shown (portal.css). */
import { useSyncExternalStore } from "react";
import { appStore, useApp, useData } from "@/lib/store";
import { DATA } from "@/lib/data";
import { approvalsWaiting } from "@/lib/approvalsWaiting";
import { TITLE, allowedSpaces, modAllowed } from "@/lib/rbac";
import { useGo, useRoute } from "@/lib/route";
import { wsMeta } from "@/services/ws";
import { Icon } from "@/components/ui";
import { useLargeText } from "@/hooks/useLargeText";

/** The places offered, in order of preference; the first four the role can open are shown (two with large text, EDGE-13, so each label
    has room; the rest stay one tap away under More). */
const PREF: Record<"ws" | "admin", string[]> = {
  ws: ["overview", "work", "issues", "risk", "controls", "evidence", "policies", "vendors", "audits", "frameworks"],
  admin: ["customers", "billing", "security", "adminlog", "elevation", "rates", "mfa"],
};
const SHORT: Record<string, string> = { risk: "Risks", controls: "Controls", work: "My Work", customers: "Customers", security: "Security", adminlog: "Log", elevation: "Elevation", rates: "Rates", mfa: "MFA" };
const ICON: Record<string, string> = { adminlog: "log", security: "shieldcheck", elevation: "unlock", mfa: "access" };
const MAX = 4;
const MAX_LARGE_TEXT = 2;

export function TabBar() {
  useData(); useSyncExternalStore(wsMeta.subscribe, () => wsMeta.get(), () => wsMeta.get());
  const role = useApp((s) => s.role); const mobOpen = useApp((s) => s.mobOpen);
  const route = useRoute(); const go = useGo(); const largeText = useLargeText();
  const space: "ws" | "admin" = route.space === "admin" || (route.space === "auth" && !allowedSpaces(role).includes("ws")) ? "admin" : "ws";
  const keys = PREF[space].filter((k) => TITLE[k] && modAllowed(role, space, k)).slice(0, largeText ? MAX_LARGE_TEXT : MAX);
  /** A count beside a tab; the link's name says what it counts (never the number alone). */
  const badge = (k: string): { n: number; say: string; tone?: "bad" } | null => {
    if (space !== "ws") return null;
    if (k === "work") { const n = approvalsWaiting(role); return n ? { n, say: `${n} approval${n === 1 ? "" : "s"} waiting` } : null; }
    if (k === "issues") { const n = DATA.issues.filter((i) => i.status !== "Closed").length; return n ? { n, say: `${n} open`, tone: "bad" } : null; }
    return null;
  };
  if (!keys.length) return null;
  return (
    <nav className="tabbar" aria-label="Main">
      {keys.map((k) => {
        const on = route.space === space && route.mod === k; const b = badge(k); const name = SHORT[k] ?? TITLE[k][0];
        return (
          <a key={k} href={`/${space}/${k}`} className="tabbar-i" aria-current={on ? "page" : undefined} aria-label={b ? `${name}, ${b.say}` : undefined}
            onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); go(`/${space}/${k}`); }}>
            <span className="tabbar-ic"><Icon name={ICON[k] ?? k} />{b ? <span className={`tabbar-b${b.tone ? " " + b.tone : ""}`} aria-hidden="true">{b.n > 99 ? "99+" : b.n}</span> : null}</span>
            <span className="tabbar-l">{name}</span>
          </a>
        );
      })}
      <button type="button" className="tabbar-i" aria-expanded={mobOpen} aria-controls="sidebar" onClick={() => appStore.set({ mobOpen: true })}>
        <span className="tabbar-ic"><Icon name="more" /></span><span className="tabbar-l">More</span>
      </button>
    </nav>
  );
}
