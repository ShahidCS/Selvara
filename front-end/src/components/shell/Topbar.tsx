import { Icon } from "@/components/ui";
import { appStore, persist, useApp, useData, useModVersion } from "@/lib/store";
import { ROLES, TITLE, landingPath, roleOf, allowedSpaces, modAllowed } from "@/lib/rbac";
import { notificationsFor, unreadCount } from "@/lib/notifications";
import { CUSTOMERS } from "@/lib/platform";
import { wsLog } from "@/lib/audit";
import { useGo, useRoute } from "@/lib/route";
import { useLayer } from "./LayerProvider";
import Link from "next/link";
import { NotificationsBody } from "./NotificationsPanel";
import { openShortcuts } from "./Shortcuts";

/** Labels for the last breadcrumb segment of a form page (`/ws/policies/P-1/edit`, `/ws/controls/C-1/exception`, `/ws/controls/test/new`). */
const SUB_LABEL: Record<string, string> = { edit: "Edit", exception: "Request exception", new: "New" };

export function Topbar() {
  const route = useRoute(); const go = useGo(); const L = useLayer();
  useData(); useModVersion(); // the unread badge follows data and read state
  const theme = useApp((s) => s.theme); const density = useApp((s) => s.density); const roleId = useApp((s) => s.role);
  const me = roleOf(roleId);
  const space = route.space === "admin" ? "admin" : "ws";
  const unread = unreadCount(notificationsFor(roleId, space));
  const canAsk = modAllowed(roleId, "ws", "assistant");
  const [title] = TITLE[route.mod] || [route.mod];
  const homeHref = route.space === "admin" ? "/admin/customers" : "/ws/overview";
  const themeIcon = theme === "dark" ? "moon" : theme === "light" ? "sun" : "auto";

  const cycleTheme = () => {
    const t = theme === "auto" ? "light" : theme === "light" ? "dark" : "auto";
    appStore.set({ theme: t }); persist(); L.toast("Theme: " + t);
  };
  const setRole = (id: string) => {
    if (id === roleId) { L.closeLayer(); return; }
    appStore.set({ role: id, groupsOpen: {} }); persist(); L.closeLayer();
    const r = roleOf(id);
    wsLog("role.view.switch", r.name + " (" + r.person + ")", "System");
    go(landingPath(id, route.space)); L.toast("Viewing as " + r.name);
  };
  const roleMenu = (ev: React.MouseEvent) => {
    L.popover(ev, (close) => (
      <div style={{ maxWidth: 280, maxHeight: "70vh", overflow: "auto" }}>
        <div className="ph">Switch role view</div>
        {ROLES.map((r) => (
          <button key={r.id} role="menuitem" onClick={() => setRole(r.id)} style={r.id === roleId ? { background: "var(--accent-weak)", color: "var(--accent-ink)" } : undefined}>
            <span className="avatar" style={{ width: 24, height: 24, fontSize: 10 }}>{r.initials}</span>
            <span style={{ minWidth: 0, textAlign: "left" }}><b style={{ display: "block", fontWeight: 600 }}>{r.name}</b><span style={{ fontSize: 11.5, color: "var(--muted)" }}>{r.person}</span></span>
          </button>
        ))}
        <div className="div" />
        {modAllowed(roleId, "ws", "me") ? <button role="menuitem" onClick={() => { close(); go("/ws/me"); }}><Icon name="user" />My workspace</button> : null}
        <button role="menuitem" onClick={() => { close(); go("/auth"); }}><Icon name="access" />Sign-in &amp; security</button>
        <button role="menuitemcheckbox" aria-checked={density === "compact"} onClick={() => { const d = density === "compact" ? "comfortable" : "compact"; appStore.set({ density: d }); persist(); close(); L.toast("Density: " + d); }}><Icon name={density === "compact" ? "check" : "dot"} />Compact density</button>
        <button role="menuitem" onClick={() => { close(); openShortcuts(L); }}><Icon name="grid" />Keyboard shortcuts</button>
      </div>
    ));
  };
  const openNotifications = () => L.openDrawer("Notifications", undefined, (close) => <NotificationsBody space={space} go={go} close={close} L={L} />);

  return (
    <header id="topbar">
      <button className="icon-btn hamburger" aria-label="Open menu" onClick={() => appStore.set({ mobOpen: true })}><Icon name="menu" /></button>
      <button className="icon-btn collapse-btn" aria-label="Collapse sidebar" onClick={() => { appStore.set((s) => ({ collapsed: !s.collapsed })); persist(); }}><Icon name="rows" /></button>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href={homeHref}>{route.space === "admin" ? "Admin Console" : "Workspace"}</Link>
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
                : <span className="cur" aria-current="page">{route.param === "new" ? "New" : route.param}</span>}
            </>
          ) : <><span className="sep"><Icon name="chevron" /></span><span className="cur" aria-current="page">{title}</span></>
        )}
      </nav>
      <div className="spacer" />
      <div role="search" aria-label="Site" style={{ display: "contents" }}>
      <button className="top-search" onClick={L.openPalette} aria-label="Search (Command or Ctrl K)"><Icon name="search" /><span className="ph">Search…</span><span className="kbd">⌘K</span></button>
      </div>
      {canAsk ? <button className="icon-btn" aria-label="Ask AI (Command or Ctrl J)" title="Ask AI (⌘J)" onClick={() => go("/ws/assistant")}><Icon name="assistant" /></button> : null}
      <button className="icon-btn nbell" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-haspopup="dialog" onClick={openNotifications}>
        <Icon name="bell" />{unread ? <span className="nbadge" aria-hidden="true">{unread > 9 ? "9+" : unread}</span> : null}
      </button>
      <button className="icon-btn" aria-label={`Theme: ${theme}`} onClick={cycleTheme}><Icon name={themeIcon} /></button>
      <div className="top-div" aria-hidden="true" />
      <button className="top-user" aria-haspopup="menu" aria-label={`Account: ${me.person}, ${me.name}`} onClick={roleMenu}>
        <span className="avatar">{me.initials}</span>
        <span className="tu-who"><b>{me.person}</b><span>{me.name}</span></span>
        <Icon name="chevd" className="tu-chev" />
      </button>
    </header>
  );
}
export { allowedSpaces };
