import { SETTINGS_KEYS, SettingsFrame } from "./SettingsMenu";
import { ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/router";
import { installTabKeys } from "@/lib/tabKeys";
import { appStore, loadPersisted, persist, setModState, useApp, useData } from "@/lib/store";
import { restoreSession } from "@/lib/session";
import { loadWorkspace, wsMeta } from "@/services/ws";
import { StepUpHost } from "@/components/kit/StepUp";
import { confirmSession } from "@/services/authApi";
import { API_MODE } from "@/services/http";
import { getWelcome, welcomeText } from "@/lib/accountSecurity";
import { brandAttr } from "@/lib/brand";
import { TEAM_SETTINGS } from "@/services/team";
import { ROLES, TITLE, allowedSpaces, landingPath, modAllowed } from "@/lib/rbac";
import { parseRoute, useGo } from "@/lib/route";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { TabBar } from "./TabBar";
import { LayerProvider, useLayer } from "./LayerProvider";
import { Empty, Icon } from "@/components/ui";
import { openShortcuts } from "./Shortcuts";
import { TourHost, startTour, tourRunning } from "@/components/kit/Tour";
import { MODULE_TOURS } from "@/data/tours";
import { loadTourPrefs, resetTourPrefs, shouldAutoStart, useTourPrefs } from "@/lib/tours";

function Frame({ children }: { children: ReactNode }) {
  const router = useRouter(); const go = useGo(); const L = useLayer();
  const s = useApp((x) => x);
  const loadError = useSyncExternalStore(wsMeta.subscribe, () => wsMeta.get().error, () => "");
  const route = parseRoute(router.asPath);

  // hydrate persisted role/theme/collapsed once on the client
  // mock mode: the browser restores and checks the session (expiry, ended elsewhere); production: the server confirms its HttpOnly session cookie
  // production: nothing acts on the role this browser remembered (it may be an older role, or another account's) until the server has confirmed
  // the session and sent the real role and company: no redirect, no data request, no page
  const [confirmed, setConfirmed] = useState(API_MODE !== "http");
  useEffect(() => installTabKeys(), []); // arrow keys on every tab bar
  useEffect(() => { loadPersisted(ROLES.map((r) => r.id)); if (API_MODE === "http") void confirmSession().then(setConfirmed); else restoreSession(); }, []);
  useEffect(() => {
    if (API_MODE === "http") return;
    const iv = setInterval(() => { if (appStore.get().signedIn) { restoreSession(); if (!appStore.get().signedIn) L.toast("Your session ended. Sign in again.", false); } }, 30_000);
    return () => clearInterval(iv);
  }, [L]);
  // signed out: every shell route goes to the sign-in page (DEMO ONLY: the real API must authenticate every request, see lib/session.ts)
  useEffect(() => { if (s.hydrated && !s.signedIn) router.replace("/login"); }, [s.hydrated, s.signedIn, router]);
  // Production: load the company's workspace records once signed in, and again whenever the company or role changes (company switch).
  const companyRef = s.company?.ref ?? null;
  useEffect(() => { if (API_MODE === "http" && confirmed && s.hydrated && s.signedIn) void loadWorkspace(); }, [confirmed, s.hydrated, s.signedIn, s.role, companyRef]);
  // guided tours: the person's preference (their account in production), then a module's tour starts by itself on its main page when the
  // preference says so. Not under browser automation (end-to-end tests), unless a test opts in.
  const tours = useTourPrefs();
  useEffect(() => { if (s.hydrated && s.signedIn) void loadTourPrefs(); else resetTourPrefs(); }, [s.hydrated, s.signedIn, s.role, companyRef]);
  useEffect(() => {
    if (!tours.loaded || !s.signedIn || route.space === "auth" || route.param) return;
    const t = MODULE_TOURS[route.mod]; if (!t || !shouldAutoStart(route.mod, t.version)) return;
    let automated = false; try { automated = navigator.webdriver && localStorage.getItem("selvara.tours.e2e") !== "1"; } catch { automated = navigator.webdriver; }
    if (automated) return;
    const at = window.location.pathname;
    const timer = window.setTimeout(() => {
      // never over a dialog, a drawer or another tour, and only if the person is still on the same page
      if (window.location.pathname !== at || tourRunning() || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (allowedSpaces(appStore.get().role).includes(route.space) && modAllowed(appStore.get().role, route.space, route.mod)) startTour(route.mod);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [tours.loaded, s.signedIn, route.space, route.mod, route.param]);
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
    if (!confirmed || !s.hydrated || !s.signedIn || route.space === "auth") return;
    if (!TITLE[route.mod] && route.mod !== "billing") return; // renders Not Found
    if (!allowedSpaces(s.role).includes(route.space) || !modAllowed(s.role, route.space, route.mod)) {
      const land = landingPath(s.role, route.space);
      if (router.asPath.replace(/\/$/, "") !== land) {
        // say why instead of moving silently (the route guard is display only: every service refuses on its own)
        const name = TITLE[route.mod]?.[0];
        if (name) L.toast(`Your role does not open ${name}.`, "info");
        router.replace(land);
      }
    }
  }, [confirmed, s.hydrated, s.signedIn, s.role, route.space, route.mod, router, L]);
  // global shortcuts: Cmd/Ctrl+K palette, +J AI Assistant, +B collapse, +/ shortcut list, Escape closes mobile sidebar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); L.openPalette(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") { e.preventDefault(); appStore.set((x) => ({ collapsed: !x.collapsed })); persist(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") { if (modAllowed(appStore.get().role, "ws", "assistant")) { e.preventDefault(); setModState("assistant.from", window.location.pathname); go("/ws/assistant"); } }
      else if ((e.metaKey || e.ctrlKey) && e.key === "/") { e.preventDefault(); openShortcuts(L); }
      else if (e.key === "Escape" && appStore.get().mobOpen) appStore.set({ mobOpen: false });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [L, go]);

  if (!s.hydrated || !s.signedIn) return null;
  const known = !!TITLE[route.mod] || route.mod === "billing" || route.space === "auth";
  // "Page not found" goes back to the role's own landing page (an Admin Console role cannot open the workspace overview)
  const home = landingPath(s.role, route.space);
  const homeLabel = (TITLE[home.split("/")[2] ?? ""] || ["your start page"])[0];
  const allowed = route.space === "auth" || (allowedSpaces(s.role).includes(route.space) && modAllowed(s.role, route.space, route.mod));
  return (
    <div id="app" className={`${s.collapsed ? "collapsed" : ""}${s.mobOpen ? " mobonly-open" : ""}`}>
      <a href="#content" className="vh" style={{ zIndex: 300 }} onClick={(e) => { e.preventDefault(); document.getElementById("content")?.focus(); }}>Skip to content</a>
      <Sidebar />
      <Topbar />
      <main id="content" tabIndex={-1}>
        {/* production: a module whose records could not be loaded says so, instead of looking empty */}
        {API_MODE === "http" && loadError && route.space === "ws" ? (
          <div className="banner warn load-error" role="alert"><Icon name="alert" aria-hidden="true" /><span>{loadError}</span>
            <button className="btn btn-secondary sm" onClick={() => window.location.reload()}>Reload</button></div>
        ) : null}
        {!known ? (
          <div className="page"><Empty icon="alert" title="Page not found" action={<button className="btn btn-primary" onClick={() => go(home)}>Back to {homeLabel}</button>}>That route doesn&apos;t exist or has moved.</Empty></div>
        ) : !confirmed || (s.hydrated && !allowed) ? null : (route.space === "ws" && SETTINGS_KEYS.includes(route.mod)) || route.mod === "auth" ? <SettingsFrame mod={route.mod}>{children}</SettingsFrame> : children}
      </main>
      <TabBar />
      <div id="scrim-sb" onClick={() => appStore.set({ mobOpen: false })} />
      <TourHost />
    </div>
  );
}
/** Standalone pages (sign-in, vendor portal, public Trust Center) follow the theme the person chose too, not only the device setting. */
function StandaloneTheme() {
  const theme = useApp((x) => x.theme);
  useEffect(() => { if (!appStore.get().hydrated) loadPersisted(ROLES.map((r) => r.id)); }, []);
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);
  return null;
}
/** Routes rendered WITHOUT the app chrome (external users have no workspace role, sidebar or role switcher). */
const STANDALONE = ["/vendor-portal", "/login", "/trust"];
const noop = () => () => {};
export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useRouter();
  // The standalone pages render in the browser, like the workspace: the server's HTML is the empty container only. Their
  // components use React style props, which the browser applies after the page loads (allowed by CSP style-src 'self');
  // style attributes in the server's HTML would be blocked. The build fails if a page's HTML carries one (scripts/check-html.mjs).
  const client = useSyncExternalStore(noop, () => true, () => false);
  if (STANDALONE.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    // body is overflow:hidden in the portal CSS, so the standalone container scrolls itself (#standalone in portal.css)
    return <LayerProvider><StandaloneTheme /><div id="standalone">{client ? children : null}</div></LayerProvider>;
  }
  return <LayerProvider><Frame>{children}</Frame>{API_MODE === "http" ? <StepUpHost /> : null}</LayerProvider>;
}
