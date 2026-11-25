/* R37: one Settings page with a menu on the left. The company's settings modules keep their own addresses (/ws/team, /ws/integrations, ...),
   so old links and bookmarks still work; the sidebar shows them as a single "Settings" entry and this menu moves between them.
   Each entry appears only for roles that can open it. */
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui";
import nav from "@/data/nav.json";
import { modAllowed } from "@/lib/rbac";
import { useApp } from "@/lib/store";

type Item = [string, string, string];
const GROUP = (nav.NAV.ws as unknown as { g: string; items: Item[] }[]).find((g) => g.g === "Settings")!;
export const SETTINGS_KEYS: string[] = GROUP.items.map((i) => i[0]);
const label = (k: string) => GROUP.items.find((i) => i[0] === k)!;
/** The menu's sections, in the order people look for them. */
const SECTIONS: [string, string[]][] = [["Company", ["team", "billingws"]], ["Connections", ["integrations", "api", "assistant"]], ["Security and audit", ["appsec", "auditlog"]]];
/** Where the sidebar's Settings entry goes: the first settings page the role can open. */
export const settingsHome = (role: string) => SECTIONS.flatMap((s) => s[1]).find((k) => modAllowed(role, "ws", k)) ?? null;

export function SettingsFrame({ mod, children }: { mod: string; children: ReactNode }) {
  const role = useApp((s) => s.role);
  const sections = SECTIONS.map(([g, keys]) => [g, keys.filter((k) => modAllowed(role, "ws", k))] as [string, string[]]).filter(([, k]) => k.length);
  return (
    <div className="settings-layout">
      <nav className="settings-menu" aria-label="Settings">
        <div className="settings-menu-h"><Icon name="team" aria-hidden="true" />Settings</div>
        {sections.map(([g, keys]) => (
          <div key={g} className="settings-sec">
            <div className="settings-sec-h">{g}</div>
            <ul>{keys.map((k) => { const [, name, icon] = label(k); return <li key={k}><Link href={`/ws/${k}`} aria-current={k === mod ? "page" : undefined}><Icon name={icon} aria-hidden="true" />{name}</Link></li>; })}</ul>
          </div>
        ))}
        <div className="settings-sec">
          <div className="settings-sec-h">You</div>
          <ul><li><Link href="/auth" aria-current={mod === "auth" ? "page" : undefined}><Icon name="access" aria-hidden="true" />Your account</Link></li></ul>
        </div>
      </nav>
      <div className="settings-main">{children}</div>
    </div>
  );
}
