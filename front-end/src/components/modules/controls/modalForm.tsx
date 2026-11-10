import { useEffect, useState } from "react";

type FormEl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Shared handle between a modal body (inputs, error line) and its footer buttons (submit). The body registers its inputs with
 *  `ref("name")` and its error flag with `onErr`; the footer reads them with `val` and calls `showErr`. The handle owns its own
 *  mutation, so component bodies never write to it directly. */
export interface FormHandle {
  els: Record<string, FormEl | null>;
  showErr?: () => void;
  /** Ref callback that registers an input under `key`. */
  ref: (key: string) => (el: FormEl | null) => void;
  /** Registers the error-line setter; returns the cleanup that unregisters it. */
  onErr: (fn: () => void) => () => void;
}
export const newForm = (): FormHandle => {
  const h: FormHandle = {
    els: {},
    ref: (key) => (el) => { h.els[key] = el; },
    onErr: (fn) => { h.showErr = fn; return () => { h.showErr = undefined; }; },
  };
  return h;
};
export const val = (h: FormHandle, k: string) => (h.els[k]?.value ?? "");
export function useErrFlag(h: FormHandle): boolean {
  const [e, setE] = useState(false);
  useEffect(() => h.onErr(() => setE(true)), [h]);
  return e;
}
export const REQ = <span style={{ color: "var(--bad-ink)" }}>*</span>;
