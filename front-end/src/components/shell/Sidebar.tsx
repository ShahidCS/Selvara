import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Icon } from "@/components/ui";
import { appStore, getModState, persist, setModState, useApp, useData, useModVersion } from "@/lib/store";
import { NAV, allowedSpaces, modAllowed, roleOf } from "@/lib/rbac";
import { countFor } from "@/lib/counts";
import { SUBNAV } from "@/lib/subnav";
import { useGo, useRoute } from "@/lib/route";
import { landingPath } from "@/lib/rbac";

/** Tooltip / sub-menu flyout for the collapsed rail. Portal-positioned (position: fixed), so it is never clipped. */
function NavTip({ tip, onEnter, onLeave, go, hide }: { tip: { anchor: HTMLElement; label: string; parent?: string } | null; onEnter: () => void; onLeave: () => void; go: (p: string) => void; hide: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const route = useRoute();
  useModVersion();
  useEffect(() => {
    if (!tip || !ref.current) { setPos(null); return; }
    const a = tip.anchor.getBoundingClientRect(); const tb = ref.current.getBoundingClientRect();
    let top = Math.round(a.top + a.height / 2 - tb.height / 2);
    top = Math.max(8, Math.min(top, window.innerHeight - tb.height - 8));
    setPos({ left: Math.round(a.right + 10), top });
  }, [tip]);
  const sn = tip?.parent ? SUBNAV[tip.parent] : null;
  const cur = sn ? getModState(sn.stateKey, sn.initial) : null;
  const onMod = !!tip?.parent && route.mod === tip.parent;
  return (
    <div id="navtip" ref={ref} className={`${tip && pos ? "show" : ""}${sn ? " flyout" : ""}`}
      role={sn ? "menu" : "tooltip"} onMouseEnter={onEnter} onMouseLeave={onLeave}
      style={{ left: pos?.left ?? -999, top: pos?.top ?? -999, pointerEvents: sn && tip ? "auto" : "none" }}>
      {tip ? (sn ? (
        <>
          <div className="ft-h">{tip.label}</div>
          {sn.items.map(([tk, tl]) => (
            <button key={tk} role="menuitem" className={`ft-i${onMod && cur === tk ? " active" : ""}`}
              onClick={() => { setModState(sn.stateKey, tk); appStore.set({ navOpen: tip.parent! }); hide(); if (!onMod) go(`/${route.space}/${tip.parent}`); }}>
              <span className="fd" />{tl}
            </button>
          ))}
        </>
      ) : tip.label) : null}
    </div>
  );
}

export function Sidebar() {
  const go = useGo();
  const router = useRouter();
  const route = useRoute();
  useData(); // nav counts follow DATA
  useModVersion(); // sub-nav highlight follows module tabs
  const s = useApp((x) => x);
  const space = route.space === "admin" ? "admin" : "ws";
  const spaces = allowedSpaces(s.role);
  const [tip, setTip] = useState<{ anchor: HTMLElement; label: string; parent?: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastMod = useRef<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const scrollTop = useRef(0);
  const hide = () => { clearTimeout(timer.current); setTip(null); };

  // accordion auto-opens the active module (and closes a stale one) only when the route changes
  useEffect(() => {
    if (route.mod !== lastMod.current) {
      lastMod.current = route.mod;
      appStore.set({ navOpen: SUBNAV[route.mod] ? route.mod : null });
    }
  }, [route.mod]);
  useEffect(() => { if (navRef.current) navRef.current.scrollTop = scrollTop.current; });
  useEffect(() => { hide(); }, [s.collapsed, route.mod]);

  const groups = (NAV[space] || []).map((g) => ({ g: g.g, items: g.items.filter((it) => modAllowed(s.role, space, it[0])) })).filter((g) => g.items.length);
  // like the prototype, a group's open state is fixed the first time it is rendered (the active group opens, others stay closed)
  const groupOpen = (g: { g: string; items: any[] }) => (g.g in s.groupsOpen ? s.groupsOpen[g.g] !== false : g.items.some((it) => it[0] === route.mod));
  useEffect(() => {
    if (!router.isReady) return; // asPath is a placeholder until hydrated
    const missing = groups.filter((g) => !(g.g in appStore.get().groupsOpen));
    if (missing.length) appStore.set((x) => ({ groupsOpen: { ...x.groupsOpen, ...Object.fromEntries(missing.map((g) => [g.g, g.items.some((it) => it[0] === route.mod)])) } }));
  });

  const show = (anchor: HTMLElement) => {
    if (!s.collapsed) return;
    const parent = anchor.getAttribute("data-parent") || undefined; const label = anchor.getAttribute("data-tip") || "";
    clearTimeout(timer.current); timer.current = setTimeout(() => setTip({ anchor, label, parent }), 90);
  };
  const onOver = (e: React.MouseEvent) => {
    const it = (e.target as HTMLElement).closest(".nav-item,.space-switch .icon-btn") as HTMLElement | null;
    if (!it || !s.collapsed || tip?.anchor === it) return; show(it);
  };
  const onOut = (e: React.MouseEvent) => {
    const to = e.relatedTarget as Node | null; const el = document.getElementById("navtip");
    if (el && to instanceof Node && (el === to || el.contains(to))) return;
    const it = (e.target as HTMLElement).closest(".nav-item,.space-switch .icon-btn");
    if (it) { clearTimeout(timer.current); timer.current = setTimeout(() => { if (el && el.matches(":hover")) return; setTip(null); }, 120); }
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const rows = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(".nav-item, .subnav.open .subitem")).filter((el) => el.offsetParent !== null);
    const i = rows.indexOf(document.activeElement as HTMLElement); if (i < 0) return; e.preventDefault();
    rows[e.key === "ArrowDown" ? Math.min(i + 1, rows.length - 1) : Math.max(i - 1, 0)].focus();
  };

  const switchSpace = (sp: "ws" | "admin") => {
    if (space === sp || !spaces.includes(sp)) return;
    appStore.set({ groupsOpen: {} }); persist();
    go(sp === "admin" ? "/admin/customers" : "/ws/overview");
  };
  const navMod = (key: string) => { appStore.set({ navOpen: key }); lastMod.current = null; go(`/${space}/${key}`); };
  const toggleParent = (key: string) => { appStore.set({ navOpen: s.navOpen === key ? null : key }); hide(); };
  const navSub = (key: string, tab: string) => {
    const sn = SUBNAV[key]; setModState(sn.stateKey, tab); appStore.set({ navOpen: key }); hide();
    if (route.mod !== key) { lastMod.current = null; go(`/${space}/${key}`); }
  };
  const toggleGroup = (g: string, cur: boolean) => appStore.set({ groupsOpen: { ...s.groupsOpen, [g]: !cur } });
  const other = space === "admin" ? "Workspace" : "Admin";

  return (
    <>
      <aside id="sidebar" aria-label="Primary" onMouseOver={onOver} onMouseOut={onOut} onKeyDown={onKey}
        onFocus={(e) => { const it = (e.target as HTMLElement).closest(".nav-item") as HTMLElement | null; if (it && s.collapsed) { clearTimeout(timer.current); setTip({ anchor: it, label: it.getAttribute("data-tip") || "", parent: it.getAttribute("data-parent") || undefined }); } }}
        onBlur={() => { if (s.collapsed) hide(); }}>
        <div className="sb-top">
          <div className="sb-logo">
            <svg className="mark" viewBox="0 0 30 30" fill="none" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="6" stroke="var(--accent)" strokeWidth="2.4" /><rect x="14" y="14" width="13" height="13" rx="4" fill="#E8653F" /></svg>
            <span>Selvara</span>
          </div>
        </div>
        {spaces.length > 1 ? (
          <div className="space-switch">
            {s.collapsed ? (
              <button className="icon-btn" style={{ width: "100%", height: 36 }} aria-label={`Switch to ${other}`} data-tip={`Switch to ${other}`} onClick={() => switchSpace(space === "admin" ? "ws" : "admin")}>
                <Icon name={space === "admin" ? "frameworks" : "customers"} />
              </button>
            ) : (
              <div className="seg" role="tablist" aria-label="Workspace or Admin">
                <button role="tab" aria-selected={space === "ws"} onClick={() => switchSpace("ws")}><Icon name="frameworks" /><span className="seg-txt">Workspace</span></button>
                <button role="tab" aria-selected={space === "admin"} onClick={() => switchSpace("admin")}><Icon name="customers" /><span className="seg-txt">Admin</span></button>
              </div>
            )}
          </div>
        ) : null}
        <nav ref={navRef} className="sb-nav scroll" aria-label={space === "admin" ? "Admin Console" : "Workspace"} onScroll={(e) => { scrollTop.current = (e.target as HTMLElement).scrollTop; }}>
          {groups.length === 0 ? (
            <div className="empty" style={{ padding: "24px 12px" }}><div className="ei"><Icon name="shieldcheck" /></div><p>This role has no modules in this space.</p></div>
          ) : groups.map((g) => {
            const open = groupOpen(g);
            return (
              <div key={g.g} className={`grp ${open ? "" : "closed"}`}>
                <button className="grp-title" onClick={() => toggleGroup(g.g, open)} aria-expanded={open}>{g.g}<Icon name="chevd" className="chev" /></button>
                <div className="grp-items">
                  {g.items.map(([key, label, icon]) => {
                    const active = key === route.mod; const c = countFor(key); const sn = SUBNAV[key];
                    if (sn) {
                      const opened = s.navOpen === key; const subId = "subnav-" + key; const curTab = getModState(sn.stateKey, sn.initial);
                      return (
                        <div key={key} className={`nav-parent ${opened ? "open" : ""}`}>
                          <button className={`nav-item ${active ? "active" : ""}`} data-tip={label} data-parent={key} aria-current={active ? "page" : undefined} aria-expanded={opened} aria-controls={subId} onClick={() => navMod(key)}>
                            <Icon name={icon} className="ico" /><span className="lbl">{label}</span>{c ? <span className="cnt">{c}</span> : null}
                          </button>
                          <button className="nav-chev" tabIndex={-1} aria-hidden="true" onClick={(e) => { e.stopPropagation(); toggleParent(key); }}><Icon name="chevd" /></button>
                          <div className={`subnav ${opened ? "open" : ""}`} id={subId} role="menu" aria-label={label}>
                            <div className="subnav-in"><div className="subnav-pad">
                              {sn.items.map(([tk, tl]) => {
                                const sa = active && curTab === tk;
                                return (
                                  <button key={tk} className={`subitem ${sa ? "active" : ""}`} role="menuitem" aria-current={sa ? "true" : "false"} tabIndex={opened ? 0 : -1} onClick={() => navSub(key, tk)}>
                                    <span className="sdot" /><span className="slbl">{tl}</span>
                                  </button>
                                );
                              })}
                            </div></div>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <button key={key} className={`nav-item ${active ? "active" : ""}`} data-tip={label} aria-current={active ? "page" : undefined} onClick={() => go(`/${space}/${key}`)}>
                        <Icon name={icon} className="ico" /><span className="lbl">{label}</span>{c ? <span className="cnt">{c}</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>
      <NavTip tip={tip} onEnter={() => clearTimeout(timer.current)} onLeave={hide} go={go} hide={hide} />
    </>
  );
}
export { landingPath, roleOf };
