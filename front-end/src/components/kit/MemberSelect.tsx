import { SelectList } from "@/components/ui";
/* Production owner and assignee picker: the company's active members from the server (services/ws.ts). The server checks the choice again;
   a person is identified by their member id, never by a typed name. */
import { useSyncExternalStore } from "react";
import { appStore } from "@/lib/store";
import { wsMeta, type WsMember } from "@/services/ws";

export function useMembers(): WsMember[] { return useSyncExternalStore(wsMeta.subscribe, () => wsMeta.get().members, () => wsMeta.get().members); }
/** The signed-in person's member id (by their name from the session), for a sensible default. */
export function myMemberId(members: WsMember[]): string { const me = appStore.get().who; return members.find((m) => m.name === me)?.id ?? members[0]?.id ?? ""; }

export function MemberSelect({ id, value, onChange, label = "Owner", help }: { id: string; value: string; onChange: (id: string) => void; label?: string; help?: string }) {
  const ms = useMembers();
  return (
    <div className="field"><label htmlFor={id}>{label}</label>
      <SelectList className="select" id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={help ? id + "-help" : undefined}>
        {ms.length ? null : <option value="">Loading members…</option>}
        {ms.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </SelectList>
      {help ? <p className="field help" id={id + "-help"}>{help}</p> : null}
    </div>
  );
}
