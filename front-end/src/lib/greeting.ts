/** The time-of-day greeting from the person's local clock (the shell renders only in the browser, so this is their own time zone).
 *  Midnight to 04:59 is "Hello": "Good Morning" at 2 a.m. reads wrong. Each word is capitalised: "Good Morning", "Good Afternoon", "Good Evening". */
export function greetingFor(hour: number): string {
  if (hour < 5) return "Hello";
  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
}
export const localGreeting = (d: Date = new Date()) => greetingFor(d.getHours());

/** "Thursday, 26 November 2026": weekday, two-digit day, month in words and year (en-GB), in the person's time zone. With no zone (or one the
 *  runtime does not know) it is the browser's own, which is also the zone the server uses for that person's "today" (EDGE-16, X-Time-Zone).
 *  Built from the parts so the comma does not depend on the browser's locale data. */
export function longDate(d: Date = new Date(), timeZone?: string): string {
  const fmt = (tz?: string) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric", ...(tz ? { timeZone: tz } : {}) });
  let f: Intl.DateTimeFormat; try { f = fmt(timeZone); } catch { f = fmt(); }
  const parts = f.formatToParts(d); const v = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return `${v("weekday")}, ${v("day")} ${v("month")} ${v("year")}`;
}
/** The Overview's eyebrow: the date, then what the page shows (the month is not repeated). Shown upper case by the eyebrow style. */
export const postureEyebrow = (d: Date = new Date(), timeZone?: string) => `${longDate(d, timeZone)} · Overall Security Posture`;
