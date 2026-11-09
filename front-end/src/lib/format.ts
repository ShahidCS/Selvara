export const money = (n: number, cur = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: cur === "USD" ? 2 : 0 }).format(n);
export const num = (n: number) => new Intl.NumberFormat("en-US").format(n);
const p2 = (x: number) => String(x).padStart(2, "0");
export function nowStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
export function nowStampUTC(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}
/** CSV cell with formula-injection guard (cells starting with = + - @ tab CR get a leading apostrophe). */
export function csvCell(v: unknown): string {
  let x = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(x)) x = "'" + x;
  return '"' + x.split('"').join('""') + '"';
}
export function blobDownload(fname: string, text: string, mime = "text/plain;charset=utf-8"): boolean {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement("a");
    a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  } catch { return false; }
}
/** Same signature as the prototype's downloadText; returns false when the browser blocks downloads. */
export function downloadText(fname: string, text: string, mime?: string): boolean {
  return blobDownload(fname, text, mime);
}
/** HTML-escape for strings interpolated into generated HTML documents (board pack, reports). */
export const esc = (s: unknown): string =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
