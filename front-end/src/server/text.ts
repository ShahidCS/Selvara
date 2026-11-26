/* Server-only. SEC-6 (ASVS V5.1.3): a text field takes a string (or a plain number or boolean, as a form may send). An object or an array is
   not text: it becomes "" instead of "[object Object]" or "a,b", so a required field is refused (400) and an optional one stays empty. */
export const scalarText = (v: unknown): string => (v === null || v === undefined || typeof v === "object" || typeof v === "function" ? "" : String(v));
