/* Arrow-key movement for every tab bar (WAI-ARIA tabs pattern): Left/Right (or Up/Down) move to the previous or next tab and open it, Home and End
   go to the first and last. Installed once by the app shell, so the hand-built tab bars and the shared ones behave the same. A tab bar that
   handles its own keys calls preventDefault and is left alone. */
export function installTabKeys(doc: Document = document): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const tab = (e.target as HTMLElement | null)?.closest?.('[role="tab"]') as HTMLElement | null;
    const list = tab?.closest('[role="tablist"]'); if (!tab || !list) return;
    const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')].filter((t) => t.closest('[role="tablist"]') === list && !t.hasAttribute("disabled"));
    const i = tabs.indexOf(tab); if (i < 0) return;
    const k = e.key;
    const n = k === "ArrowRight" || k === "ArrowDown" ? (i + 1) % tabs.length : k === "ArrowLeft" || k === "ArrowUp" ? (i - 1 + tabs.length) % tabs.length : k === "Home" ? 0 : k === "End" ? tabs.length - 1 : -1;
    if (n < 0) return;
    e.preventDefault(); tabs[n].focus(); tabs[n].click(); tabs[n].scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };
  doc.addEventListener("keydown", onKey);
  return () => doc.removeEventListener("keydown", onKey);
}
