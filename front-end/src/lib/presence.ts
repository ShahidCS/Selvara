/* Presence (phase 5, DRAFT): who else has this record open, and whether they are editing it. Demonstration build: the browser's BroadcastChannel,
   so it works between tabs of this browser. Production: a Supabase Realtime Presence channel per record, joined only by people the database allows
   to read that record. Shows names only, never what anyone typed. Nothing is stored. */
export interface PresenceEntry { id: string; path: string; person: string; editing: boolean; at: number }
export const PRESENCE = { BEAT_MS: 4000, STALE_MS: 12000 };
const tabId = (() => { try { return crypto.getRandomValues(new Uint32Array(2)).join("-"); } catch { return String(Math.random()); } })();
export const myTabId = () => tabId;
/** Keeps the others on `path` up to date; calls `onChange` with everyone else here (newest first). Returns a stop function. */
export function joinPresence(path: string, me: { person: string; editing: boolean }, onChange: (others: PresenceEntry[]) => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => undefined;
  const ch = new BroadcastChannel("selvara-presence"); const seen = new Map<string, PresenceEntry>();
  const emit = () => { const now = Date.now(); onChange([...seen.values()].filter((e) => e.path === path && e.id !== tabId && now - e.at < PRESENCE.STALE_MS).sort((a, b) => b.at - a.at)); };
  const beat = () => ch.postMessage({ type: "here", entry: { id: tabId, path, person: me.person, editing: me.editing, at: Date.now() } });
  ch.onmessage = (ev) => {
    const m = ev.data as { type: string; entry?: PresenceEntry; id?: string };
    if (m.type === "here" && m.entry && typeof m.entry.person === "string") { const first = !seen.has(m.entry.id); seen.set(m.entry.id, { ...m.entry, person: m.entry.person.slice(0, 80), at: Date.now() }); if (first && m.entry.path === path) beat(); }
    else if (m.type === "leave" && m.id) seen.delete(m.id);
    emit();
  };
  beat(); const iv = setInterval(() => { beat(); emit(); }, PRESENCE.BEAT_MS);
  const leave = () => { try { ch.postMessage({ type: "leave", id: tabId }); } catch { /* closed */ } };
  window.addEventListener("pagehide", leave); // a closed tab says goodbye too (React cleanup does not run then)
  return () => { clearInterval(iv); window.removeEventListener("pagehide", leave); leave(); ch.close(); };
}
