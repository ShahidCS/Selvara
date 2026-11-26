/* HTTP client. The prototype made no network calls, so everything defaults to "mock" mode (in-memory seeded data).
 * Set NEXT_PUBLIC_API_MODE=http and NEXT_PUBLIC_API_BASE_URL to call a real API. No secrets here; credentials come from the
 * session cookie (credentials: "include"), never from client code or the repo. */
export const API_MODE = (process.env.NEXT_PUBLIC_API_MODE || "mock") as "mock" | "http";
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

/* EDGE-10, EDGE-11: a dropped connection (airplane mode) or a server that does not answer in time is said plainly, never as a generic failure
   and never as an endless spinner. The message says to check before retrying, since a change may have been saved before the answer was lost. */
export const OFFLINE_MSG = "The connection dropped before Selvara answered. Check your connection, then check whether your change was saved before trying again.";
export const TIMEOUT_MSG = "Selvara did not answer in time. Check your connection, then check whether your change was saved before trying again.";
/** Requests stop after this long: a little more than the server's own limit (maxDuration 60 s); uploads get longer. */
export const REQUEST_TIMEOUT_MS = 65_000; export const UPLOAD_TIMEOUT_MS = 120_000;
export class NetworkError extends ApiError { constructor(message: string) { super(0, message); this.name = "NetworkError"; } }
/** fetch with a time limit; a network failure or a timeout becomes a NetworkError with a message for people. */
/** EDGE-16: the browser's IANA time zone, so the server counts "today" from the viewer's own day (times stay in UTC). */
const timeZone = (): string => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } };
export async function netFetch(url: string, init: RequestInit, ms = REQUEST_TIMEOUT_MS): Promise<Response> {
  const tz = timeZone(); const headers = new Headers(init.headers); if (tz && !headers.has("X-Time-Zone")) headers.set("X-Time-Zone", tz);
  try { return await fetch(url, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(ms) }); }
  catch (e) { throw new NetworkError((e as Error)?.name === "TimeoutError" ? TIMEOUT_MSG : OFFLINE_MSG); }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (API_MODE !== "http" || !API_BASE) throw new ApiError(0, "API is in mock mode");
  const res = await netFetch(`${API_BASE}${path}`, {
    ...init, credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(init.headers || {}) },
  });
  if (!res.ok) { let m = `${res.status} ${res.statusText}`; try { const j = await res.json(); if (j && typeof j.error === "string") m = j.error; } catch { /* no JSON body */ } throw new ApiError(res.status, m); }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
/** Run `mock()` in mock mode, else call the API. Keeps the UI synchronous-feeling in mock mode. */
export async function viaApi<T>(mock: () => T, real: () => Promise<T>): Promise<T> {
  return API_MODE === "http" && API_BASE ? real() : mock();
}
