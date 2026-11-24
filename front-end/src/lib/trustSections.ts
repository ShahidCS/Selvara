/* What a company's Trust Center shows to people outside it (security fix F1-02). Shared by the server (server/ws/trust.ts,
   server/trustpublic.ts) and the demonstration (features/trust), so both decide the same way. The server is the control: it leaves a
   hidden section out of the page entirely.
   - Sections: each one is published or not by the company. Missing settings (companies from before this fix) publish everything except
     the live control status, which the company turns on itself, with a second admin's or owner's approval.
   - Documents: Public documents are listed by name. Documents under NDA are counted, never named, until they are granted to the person
     looking (their company's account, which they are a viewer of). */
export type TrustSection = "faq" | "subprocessors" | "updates" | "controls" | "documents";
export type TrustSections = Record<TrustSection, boolean>;
export const TRUST_SECTIONS: { key: TrustSection; label: string; hint: string }[] = [
  { key: "documents", label: "Documents", hint: "Public documents by name, and how many documents are under NDA (their names stay hidden until granted)." },
  { key: "faq", label: "Frequently asked questions", hint: "Verified answers from your answer library." },
  { key: "subprocessors", label: "Sub-processors", hint: "Approved vendors that process customer data." },
  { key: "updates", label: "Updates", hint: "Your last five public publications." },
  { key: "controls", label: "Live control status", hint: "Pass or In review per control domain, computed live. Turning it on needs a second admin or owner." },
];
/** The sections a company publishes; anything missing takes the default (all on, except the live control status). */
export function sectionsOf(s?: Partial<Record<string, unknown>> | null): TrustSections {
  return { faq: s?.faq !== false, subprocessors: s?.subprocessors !== false, updates: s?.updates !== false, documents: s?.documents !== false, controls: s?.controls === true };
}
export const isTrustSection = (k: unknown): k is TrustSection => typeof k === "string" && TRUST_SECTIONS.some((x) => x.key === k);
export const sectionLabel = (k: TrustSection) => TRUST_SECTIONS.find((x) => x.key === k)?.label ?? k;
/** What a request that names no document asks for, and how documents under NDA are shown before they are granted. */
export const NDA_DOCS = "Documents under NDA";
export const isNdaDoc = (access: string) => access !== "Public";
export const ndaCountText = (n: number) => `${n} document${n === 1 ? "" : "s"} under NDA`;
/** The documents a person may see by name: public ones, and those under NDA granted to them (`granted` holds their references). */
export function visibleDocs<T extends { access: string }>(docs: T[], granted: (d: T) => boolean): { listed: T[]; ndaHidden: number } {
  const listed = docs.filter((d) => !isNdaDoc(d.access) || granted(d));
  return { listed, ndaHidden: docs.length - listed.length };
}
