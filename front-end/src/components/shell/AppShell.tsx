import { ReactNode, useEffect } from "react";
import { useRouter } from "next/router";
import { appStore, loadPersisted, persist, useApp, useData } from "@/lib/store";
import { restoreSession } from "@/lib/session";
import { confirmSession } from "@/services/authApi";
import { API_MODE } from "@/services/http";
import { getWelcome, welcomeText } from "@/lib/accountSecurity";
import { brandAttr } from "@/lib/brand";
import { TEAM_SETTINGS } from "@/services/team";
import { ROLES, TITLE, allowedSpaces, landingPath, modAllowed } from "@/lib/rbac";
import { parseRoute, useGo } from "@/lib/route";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { LayerProvider, useLayer } from "./LayerProvider";
import { Empty } from "@/components/ui";
import { openShortcuts } from "./Shortcuts";

function Frame({ children }: { children: ReactNode }) {
  const router = useRouter(); const go = useGo(); const L = useLayer();
  const s = useApp((x) => x);
  const route = parseRoute(router.asPath);

  // hydrate persisted role/theme/collapsed once on the client
  // mock mode: the browser restores and checks the session (expiry, ended elsewhere); production: the server confirms its HttpOnly session cookie
  useEffect(() => { loadPersisted(ROLES.map((r) => r.id)); if (API_MODE === "http") void confirmSession(); else restoreSession(); }, []);
  useEffect(() => {
    if (API_MODE === "http") return;
    const iv = setInterval(() => { if (appStore.get().signedIn) { restoreSession(); if (!appStore.get().signedIn) L.toast("Your session ended. Sign in again.", false); } }, 30_000);
    return () => clearInterval(iv);
  }, [L]);
  // signed out: every shell route goes to the sign-in page (DEMO ONLY: the real API must authenticate every request, see lib/session.ts)
  useEffect(() => { if (s.hydrated && !s.signedIn) router.replace("/login"); }, [s.hydrated, s.signedIn, router]);
  // after sign-in: when and where the previous sign-in was, and failed attempts since (shown once; also on the account page)
  useEffect(() => {
    const w = getWelcome(); if (!s.signedIn || !w || w.shown) return;
    w.shown = true; L.toast(welcomeText(w), !w.failedSince, { ms: 8000 });
  }, [s.signedIn, L]);
  // theme -> <html data-theme>
  useEffect(() => { document.documentElement.setAttribute("data-theme", s.theme); }, [s.theme]);
  // workspace colour -> <html data-brand> (workspace only: the Admin Console, sign-in and vendor portal stay on the platform colour)
  useData();
  const brand = route.space === "ws" ? brandAttr(TEAM_SETTINGS.brand) : null;
  useEffect(() => {
    const root = document.documentElement;
    if (brand) root.setAttribute("data-brand", brand); else root.removeAttribute("data-brand");
    return () => root.removeAttribute("data-brand"); // leaving the shell (for example to the vendor portal) leaves no tenant colour behind
  }, [brand]);
  // density -> <html data-density>
  useEffect(() => { document.documentElement.setAttribute("data-density", s.density); }, [s.density]);
  // print is always the light theme on white, whatever the screen theme is (restored afterwards)
  useEffect(() => {
    const root = document.documentElement; let prev: string | null = null;
    const before = () => { prev = root.getAttribute("data-theme"); root.setAttribute("data-theme", "light"); };
    const after = () => { if (prev !== null) root.setAttribute("data-theme", prev); prev = null; };
    window.addEventListener("beforeprint", before); window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, []);
  // route change closes the mobile sidebar and resets scroll (prototype: go()/route())
  useEffect(() => {
    appStore.set({ mobOpen: false });
    const m = document.getElementById("content"); if (m) { m.scrollTop = 0; m.focus({ preventScroll: true }); }
  }, [router.asPath]);
  // RBAC guard: redirect disallowed space/module to the role's landing page
  useEffect(() => {
    if (!s.hydrated || !s.signedIn || route.space === "auth") return;
    if (!TITLE[route.mod] && route.mod !== "billing") return; // renders Not Found
    if (!allowedSpaces(s.role).includes(route.space) || !modAllowed(s.role, route.space, route.mod)) {
      const land = landingPath(s.role, route.space);
      if (router.asPath.replace(/\/$/, "") !== land) router.replace(land);
    }
  }, [s.hydrated, s.signedIn, s.role, route.space, route.mod, router]);
  // global shortcuts: Cmd/Ctrl+K palette, +J AI Assistant, +B collapse, +/ shortcut list, Escape closes mobile sidebar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); L.openPalette(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") { e.preventDefault(); appStore.set((x) => ({ collapsed: !x.collapsed })); persist(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") { if (modAllowed(appStore.get().role, "ws", "assistant")) { e.preventDefault(); go("/ws/assistant"); } }
      else if ((e.metaKey || e.ctrlKey) && e.key === "/") { e.preventDefault(); openShortcuts(L); }
      else if (e.key === "Escape" && appStore.get().mobOpen) appStore.set({ mobOpen: false });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [L, go]);

  if (!s.hydrated || !s.signedIn) return null;
  const known = !!TITLE[route.mod] || route.mod === "billing" || route.space === "auth";
  const allowed = route.space === "auth" || (allowedSpaces(s.role).includes(route.space) && modAllowed(s.role, route.space, route.mod));
  return (
    <div id="app" className={`${s.collapsed ? "collapsed" : ""}${s.mobOpen ? " mobonly-open" : ""}`}>
      <a href="#content" className="vh" style={{ zIndex: 300 }} onClick={(e) => { e.preventDefault(); document.getElementById("content")?.focus(); }}>Skip to content</a>
      <Sidebar />
      <Topbar />
      <main id="content" tabIndex={-1}>
        {!known ? (
          <div className="page"><Empty icon="alert" title="Page not found" action={<button className="btn btn-primary" onClick={() => go("/ws/overview")}>Back to Overview</button>}>That route doesn&apos;t exist or has moved.</Empty></div>
        ) : s.hydrated && !allowed ? null : children}
      </main>
      <div id="scrim-sb" onClick={() => appStore.set({ mobOpen: false })} />
    </div>
  );
}
/** Routes rendered WITHOUT the app chrome (external users have no workspace role, sidebar or role switcher). */
const STANDALONE = ["/vendor-portal", "/login"];
export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useRouter();
  if (STANDALONE.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    // body is overflow:hidden in the portal CSS, so the standalone container scrolls itself
    return <LayerProvider><div id="standalone" style={{ height: "100dvh", overflow: "auto", background: "var(--bg)" }}>{children}</div></LayerProvider>;
  }
  return <LayerProvider><Frame>{children}</Frame></LayerProvider>;
}
