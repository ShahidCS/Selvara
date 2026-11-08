import { useRouter } from "next/router";
import { useCallback } from "react";

export interface Route { space: "ws" | "admin" | "auth"; mod: string; param: string | null }
/** `/ws/risk`, `/admin/billing/cust-101`, `/auth`, `/` (the prototype used `#/ws/risk` hashes). */
export function parseRoute(path: string): Route {
  const clean = path.split("?")[0].split("#")[0];
  const h = clean.split("/").filter(Boolean);
  if (!h.length) return { space: "ws", mod: "overview", param: null };
  if (h[0] === "auth") return { space: "auth", mod: "auth", param: null };
  const space = h[0] === "admin" ? "admin" : "ws";
  const rest = h[0] === "admin" || h[0] === "ws" ? h.slice(1) : h;
  return { space, mod: rest[0] || (space === "admin" ? "customers" : "overview"), param: rest[1] ? decodeURIComponent(rest[1]) : null };
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
