/* HTTP client. The prototype made no network calls, so everything defaults to "mock" mode (in-memory seeded data).
 * Set NEXT_PUBLIC_API_MODE=http and NEXT_PUBLIC_API_BASE_URL to call a real API. No secrets here; credentials come from the
 * session cookie (credentials: "include"), never from client code or the repo. */
export const API_MODE = (process.env.NEXT_PUBLIC_API_MODE || "mock") as "mock" | "http";
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (API_MODE !== "http" || !API_BASE) throw new ApiError(0, "API is in mock mode");
  const res = await fetch(`${API_BASE}${path}`, {
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
