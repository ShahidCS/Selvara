import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { joinPresence, type PresenceEntry } from "@/lib/presence";
import { roleOf } from "@/lib/rbac";
import { useApp } from "@/lib/store";
import { Icon } from "./Icon";

/** "Also here" on a record or form page. Editing pages (…/edit, …/new) say so, and warn when someone else is editing the same record. */
export function Presence() {
  const role = useApp((s) => s.role); const who = useApp((s) => s.who); const signedIn = useApp((s) => s.signedIn);
  const [others, setOthers] = useState<PresenceEntry[]>([]);
  const path = useRouter().asPath.split(/[?#]/)[0];
  useEffect(() => {
    if (!signedIn) return;
    const editing = /\/(edit|new|exception)$/.test(path);
    return joinPresence(path.replace(/\/(edit|exception)$/, ""), { person: roleOf(role).person, editing }, setOthers);
  }, [role, who, signedIn, path]);
  if (!others.length) return null;
  const me = roleOf(role).person; const editingOthers = others.filter((o) => o.editing);
  const name = (o: PresenceEntry) => (o.person === me ? "You, in another tab" : o.person);
  const iEdit = /\/(edit|exception)$/.test(path);
  return (
    <div className={`banner ${iEdit && editingOthers.length ? "warn" : "info"}`} role="status" style={{ margin: "0 0 12px", display: "flex", gap: 8, alignItems: "center", fontSize: ".8125rem" }}>
      <Icon name="user" />
      <span>{iEdit && editingOthers.length ? <><b>{editingOthers.map(name).join(", ")}</b> {editingOthers.length === 1 ? "is" : "are"} also editing this record. Save carefully: the last save wins.</>
        : <>Also here: {others.map((o) => <b key={o.id}>{name(o)}{o.editing ? " (editing)" : ""}</b>).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, ", ", el] : [el]), [])}</>}</span>
    </div>
  );
}
