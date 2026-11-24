import { useRouter } from "next/router";
import { useCallback } from "react";

/** `sub` is the third segment, for record pages with a mode such as `/ws/policies/P-001/edit`. */
export interface Route { space: "ws" | "admin" | "auth"; mod: string; param: string | null; sub: string | null }
/** `/ws/risk`, `/admin/billing/cust-101`, `/ws/policies/P-001/edit`, `/auth`, `/` (the prototype used `#/ws/risk` hashes). */
/** A malformed escape such as %E0%A4 must not crash routing; it is used as written. */
const safeDecode = (s: string): string => { try { return decodeURIComponent(s); } catch { return s; } };
export function parseRoute(path: string): Route {
  const clean = path.split("?")[0].split("#")[0];
  const h = clean.split("/").filter(Boolean);
  if (!h.length) return { space: "ws", mod: "overview", param: null, sub: null };
  if (h[0] === "auth") return { space: "auth", mod: "auth", param: null, sub: null };
  // the Help centre is for everyone signed in, like Your account (not a role-gated module): /help, /help/<article>, /help/ask, /help/questions
  if (h[0] === "help") return { space: "auth", mod: "help", param: h[1] ? safeDecode(h[1]) : null, sub: null };
  const space = h[0] === "admin" ? "admin" : "ws";
  const rest = h[0] === "admin" || h[0] === "ws" ? h.slice(1) : h;
  return { space, mod: rest[0] || (space === "admin" ? "customers" : "overview"), param: rest[1] ? safeDecode(rest[1]) : null, sub: rest[2] ? safeDecode(rest[2]) : null };
}
export function useRoute(): Route {
  const { asPath } = useRouter();
  return parseRoute(asPath);
}
/** Accepts `/ws/risk` or legacy `#/ws/risk`. */
export function useGo() {
  const router = useRouter();
  return useCallback((to: string) => {
    const p = to.replace(/^#/, "");
    if (router.asPath === p) return;
    router.push(p);
  }, [router]);
}
