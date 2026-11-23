import { hasTour, startTour } from "@/components/kit/Tour";
import { AiMark, Icon } from "@/components/ui";
import { approvalsWaiting } from "@/lib/approvalsWaiting";
import { appStore, persist, setModState, useApp, useData, useModVersion } from "@/lib/store";
import { API_ON, TITLE, landingPath, roleOf, allowedSpaces, modAllowed } from "@/lib/rbac";
import { isDemoAccount } from "@/lib/session";
import { signOut, switchCompany } from "@/services/authApi";
import { sodMessage } from "@/lib/approvalFlow";
import { useRouter } from "next/router";
import { notificationsFor, unreadCount } from "@/lib/notifications";
import { CUSTOMERS } from "@/lib/platform";
import { useGo, useRoute } from "@/lib/route";
import { useLayer } from "./LayerProvider";
import Link from "next/link";
import { NotificationsBody } from "./NotificationsPanel";
import { openShortcuts } from "./Shortcuts";

/** Labels for the last breadcrumb segment of a form page (`/ws/policies/P-1/edit`, `/ws/controls/C-1/exception`, `/ws/controls/test/new`). */
const SUB_LABEL: Record<string, string> = { edit: "Edit", exception: "Request exception", new: "New", reassess: "Reassess", waiver: "Waiver", import: "Import", answer: "Add answer" };
const THEME_NAME: Record<string, string> = { auto: "Auto (follows your device)", light: "Light", dark: "Dark" };

export function Topbar() {
  const route = useRoute(); const go = useGo(); const L = useLayer(); const router = useRouter();
  useData(); useModVersion(); // the unread badge follows data and read state
  const theme = useApp((s) => s.theme); const density = useApp((s) => s.density); const roleId = useApp((s) => s.role);
  const collapsed = useApp((s) => s.collapsed); const mobOpen = useApp((s) => s.mobOpen);
  const company = useApp((s) => s.company); const companies = useApp((s) => s.companies);
  const me = roleOf(roleId);
  const space = route.space === "admin" ? "admin" : "ws";
  const unread = unreadCount(notificationsFor(roleId, space));
  const canAsk = modAllowed(roleId, "ws", "assistant");
  const [title] = TITLE[route.mod] || [route.mod];
  const homeHref = route.space === "admin" ? "/admin/customers" : "/ws/overview";
  // the company area is named after the company (production: the session's company; demo: the persona's seeded company)
  const companyName = (API_ON ? company?.name : me.tenant ? CUSTOMERS[me.tenant]?.name : null) || "Your company";
  const themeIcon = theme === "dark" ? "moon" : theme === "light" ? "sun" : "auto";

  const nextTheme = theme === "auto" ? "light" : theme === "light" ? "dark" : "auto";
  const cycleTheme = () => {
    const t = nextTheme;
    appStore.set({ theme: t }); persist(); L.toast("Theme: " + THEME_NAME[t]);
  };
  /** Production: another company the person belongs to. The page reloads at the new role's landing page so nothing from the previous company stays. */
  const doSwitch = async (ref: string) => {
    L.closeLayer();
    try { await switchCompany(ref); window.location.assign(landingPath(appStore.get().role, "ws")); } catch (e) { L.toast(sodMessage(e, "Could not switch company"), false); }
  };
  const doSignOut = () => {
    L.closeLayer();
    void signOut().then(() => router.replace("/login"));
  };
  const roleMenu = (ev: React.MouseEvent) => {
    L.popover(ev, (close) => (
      <div style={{ maxWidth: 280, maxHeight: "70vh", overflow: "auto" }}>
        <div className="ph" style={{ display: "flex", flexDirection: "column", gap: 2 }}><b style={{ fontWeight: 600, color: "var(--ink)" }}>{me.person}</b><span>{me.name}{isDemoAccount() ? " · Demo account" : ""}</span>{API_ON && company ? <span>{company.name}</span> : null}</div>
        {API_ON && companies.length > 1 ? (
          <>
            <div className="div" />
            <div className="ph" id="co-h">Switch company</div>
            <div role="group" aria-labelledby="co-h">
              {companies.map((c) => (
                <button key={c.ref} role="menuitemradio" aria-checked={c.ref === company?.ref} disabled={c.ref === company?.ref} onClick={() => void doSwitch(c.ref)}>
                  <Icon name={c.ref === company?.ref ? "check" : "blank"} />{c.name}
                </button>
              ))}
            </div>
          </>
        ) : null}
        <div className="div" />
        {modAllowed(roleId, "ws", "work") ? <button role="menuitem" onClick={() => { close(); go("/ws/work"); }}><Icon name="user" />My work</button> : null}
        <button role="menuitem" onClick={() => { close(); go("/auth"); }}><Icon name="access" />Sign-in &amp; security</button>
        <button role="menuitemcheckbox" aria-checked={density === "compact"} onClick={() => { const d = density === "compact" ? "comfortable" : "compact"; appStore.set({ density: d }); persist(); close(); L.toast("Density: " + (d === "compact" ? "Compact" : "Comfortable")); }}><Icon name={density === "compact" ? "check" : "blank"} />Compact density</button>
        <button role="menuitem" aria-label={`Theme: ${THEME_NAME[theme] ?? theme}. Change theme`} onClick={() => { close(); cycleTheme(); }}><Icon name={themeIcon} />Theme: {THEME_NAME[theme] ?? theme}</button>
        <button role="menuitem" onClick={() => { close(); openShortcuts(L); }}><Icon name="grid" />Keyboard shortcuts</button>
        <div className="div" />
        <button role="menuitem" onClick={doSignOut}><Icon name="back" />Sign out</button>
      </div>
    ));
  };
  const waiting = approvalsWaiting(roleId);
  const showTour = route.space !== "auth" && !route.param && hasTour(route.mod);
  /** R4: help for this page, the shortcuts and (from the Help centre release) searchable articles. */
  const helpMenu = (ev: React.MouseEvent) => L.popover(ev, (close) => (
    <>
      {showTour ? <button role="menuitem" onClick={() => { close(); startTour(route.mod); }}><Icon name="play" />Take the tour of this page</button> : null}
      <button role="menuitem" onClick={() => { close(); openShortcuts(L); }}><Icon name="grid" />Keyboard shortcuts</button>
    </>
  ), { label: "Help" });
  const openNotifications = () => L.openDrawer("Notifications", undefined, (close) => <NotificationsBody space={space} go={go} close={close} L={L} />);

  return (
    <header id="topbar">
      <button className="icon-btn hamburger" aria-label="Open menu" title="Open menu" aria-expanded={mobOpen} aria-controls="sidebar" onClick={() => appStore.set({ mobOpen: true })}><Icon name="menu" /></button>
      <button className="icon-btn collapse-btn" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={`${collapsed ? "Expand" : "Collapse"} sidebar (⌘B)`} aria-expanded={!collapsed} aria-controls="sidebar" onClick={() => { appStore.set((s) => ({ collapsed: !s.collapsed })); persist(); }}><Icon name="rows" /></button>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href={homeHref}>{route.space === "admin" ? "Admin Console" : companyName}</Link>
        {route.mod === "billing" && route.param && CUSTOMERS[route.param] ? (
          <>
            <span className="sep"><Icon name="chevron" /></span><Link href="/admin/billing">Billing</Link>
            <span className="sep"><Icon name="chevron" /></span><span className="cur" aria-current="page">{CUSTOMERS[route.param].name}</span>
          </>
        ) : (
          route.param ? (
            <>
              <span className="sep"><Icon name="chevron" /></span><Link href={`/${route.space}/${route.mod}`}>{title}</Link>
              <span className="sep"><Icon name="chevron" /></span>
              {route.sub ? <><Link href={route.param === "test" ? `/${route.space}/${route.mod}` : `/${route.space}/${route.mod}/${encodeURIComponent(route.param)}`}>{route.param === "test" ? "Tests" : route.param}</Link><span className="sep"><Icon name="chevron" /></span><span className="cur" aria-current="page">{SUB_LABEL[route.sub] ?? route.sub}</span></>
                : <span className="cur" aria-current="page">{route.param === "new" || route.param === "import" || route.param === "answer" ? SUB_LABEL[route.param] : route.param}</span>}
            </>
          ) : <><span className="sep"><Icon name="chevron" /></span><span className="cur" aria-current="page">{title}</span></>
        )}
      </nav>
      <div className="spacer" />
      <div role="search" aria-label="Site" style={{ display: "contents" }}>
      <button className="top-search" onClick={L.openPalette} aria-label="Jump to a module (Command or Ctrl K)" title="Jump to a module (⌘K)"><Icon name="search" /><span className="ph">Jump to module…</span><span className="kbd">⌘K</span></button>
      </div>
      {canAsk ? <button className="icon-btn ask-ai" aria-label="Ask AI (Command or Ctrl J)" title="Ask AI (⌘J)" onClick={() => { setModState("assistant.from", window.location.pathname); go("/ws/assistant"); }}><AiMark size={20} /></button> : null}
      {API_ON ? null : <button className="icon-btn nbell" aria-label={unread ? `Notifications, ${unread > 9 ? "9+" : unread} unread` : "Notifications"} title="Notifications" aria-haspopup="dialog" onClick={openNotifications}>
        <Icon name="bell" />{unread ? <span className="nbadge" aria-hidden="true">{unread > 9 ? "9+" : unread}</span> : null}
      </button>}
      {waiting && route.space === "ws" ? <button className="appr-pill" onClick={() => go("/ws/work?tab=tasks")} aria-label={`${waiting} approval${waiting === 1 ? "" : "s"} waiting for you`}><AiMark size={28} /><span className="appr-t">{waiting} approval{waiting === 1 ? "" : "s"} waiting</span></button> : null}
      <button className="icon-btn" aria-label="Help" title="Help" aria-haspopup="menu" onClick={helpMenu}><Icon name="help" /></button>
      <div className="top-div" aria-hidden="true" />
      <button className="top-user" aria-haspopup="menu" aria-expanded="false" onClick={roleMenu}>
        <span className="avatar" aria-hidden="true">{me.initials}</span>
        <span className="tu-who"><span className="vh">Account: </span><b>{me.person}</b><span>{me.name}</span></span>
        <Icon name="chevd" className="tu-chev" />
      </button>
    </header>
  );
}
export { allowedSpaces };
