import { Icon } from "@/components/ui";
import { appStore, persist, useApp } from "@/lib/store";
import { ROLES, TITLE, landingPath, roleOf, allowedSpaces } from "@/lib/rbac";
import { CUSTOMERS } from "@/lib/platform";
import { wsLog } from "@/lib/audit";
import { useGo, useRoute } from "@/lib/route";
import { useLayer } from "./LayerProvider";
import Link from "next/link";

export function Topbar() {
  const route = useRoute(); const go = useGo(); const L = useLayer();
  const theme = useApp((s) => s.theme); const roleId = useApp((s) => s.role);
  const me = roleOf(roleId);
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
        <button role="menuitem" onClick={() => { close(); go("/auth"); }}><Icon name="access" />Sign-in &amp; security</button>
      </div>
    ));
  };
  const notifMenu = (ev: React.MouseEvent) => {
    L.popover(ev, (close) => (
      <>
        <div className="ph">Notifications</div>
        <button role="menuitem" onClick={() => { go("/ws/issues"); close(); }}><Icon name="alert" />2 controls failing</button>
        <button role="menuitem" onClick={() => { go("/ws/vendors"); close(); }}><Icon name="vendors" />Vendor review overdue</button>
        <button role="menuitem" onClick={() => { go("/admin/billing"); close(); }}><Icon name="billing" />Contoso invoice past due</button>
      </>
    ));
  };

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
          <><span className="sep"><Icon name="chevron" /></span><span className="cur" aria-current="page">{title}</span></>
        )}
      </nav>
      <div className="spacer" />
      <button className="top-search" onClick={L.openPalette} aria-label="Search (Command or Ctrl K)"><Icon name="search" /><span className="ph">Search…</span><span className="kbd">⌘K</span></button>
      <button className="icon-btn" aria-label="Notifications" aria-haspopup="menu" onClick={notifMenu}><Icon name="bell" /></button>
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
