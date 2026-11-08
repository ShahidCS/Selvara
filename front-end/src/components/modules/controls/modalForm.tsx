import { useEffect, useState } from "react";

/** Shared handle between a modal body (inputs, error line) and its footer buttons (submit). */
export interface FormHandle {
  els: Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>;
  showErr?: () => void;
}
export const newForm = (): FormHandle => ({ els: {} });
export const val = (h: FormHandle, k: string) => (h.els[k]?.value ?? "");
export function useErrFlag(h: FormHandle): boolean {
  const [e, setE] = useState(false);
  useEffect(() => { h.showErr = () => setE(true); return () => { h.showErr = undefined; }; }, [h]);
  return e;
}
export const REQ = <span style={{ color: "var(--bad-ink)" }}>*</span>;
