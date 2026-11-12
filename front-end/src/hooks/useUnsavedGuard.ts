import { createElement, useCallback, useEffect, useRef } from "react";
import Router from "next/router";
import type { LayerApi } from "@/components/shell/LayerProvider";

/** Protects a form page from losing typed work. While `dirty`, closing the tab asks the browser to confirm, and leaving the page (the back link, the
 *  sidebar, the browser Back button) opens an in-app "Discard unsaved changes?" dialog with Stay and Discard. Call `allowLeave()` just before navigating
 *  after a successful save so the guard does not ask.
 *
 *  Navigation is intercepted by wrapping the router's `push` and `replace` for as long as the form is dirty (both `Link` and `useGo` call them), so
 *  nothing is thrown and nothing is logged; Back and Forward go through `beforePopState`. Everything is restored when the form is clean or unmounts. */
export function useUnsavedGuard(dirty: boolean, L: LayerApi) {
  const allow = useRef(false);
  const allowLeave = useCallback(() => { allow.current = true; }, []);

  useEffect(() => {
    if (!dirty) return;
    const ask = (target: string) => {
      L.openModal("Discard unsaved changes?", (close) => createElement("div", null,
        createElement("p", { style: { margin: "0 0 8px" } }, "You have changes that are not saved. If you leave this page they are lost."),
        createElement("div", { className: "btngrp", style: { justifyContent: "flex-end", marginTop: 12 } },
          createElement("button", { className: "btn btn-secondary", "data-focus": true, onClick: close }, "Stay on this page"),
          createElement("button", { className: "btn btn-danger", onClick: () => { allow.current = true; close(); void Router.push(target); } }, "Discard changes")),
      ), () => null);
    };
    // Link and useGo both end up in the router singleton's push and replace, so that is where they are intercepted
    const inst = Router.router as unknown as { push: (...a: unknown[]) => Promise<boolean>; replace: (...a: unknown[]) => Promise<boolean> } | null;
    if (!inst) return;
    const asString = (u: unknown): string => (typeof u === "string" ? u : (u as { pathname?: string } | null)?.pathname || Router.asPath);
    const push = inst.push, replace = inst.replace;
    inst.push = (u, as, o) => {
      if (allow.current) return push.call(inst, u, as, o);
      ask(typeof as === "string" ? as : asString(u)); return Promise.resolve(false);
    };
    inst.replace = (u, as, o) => {
      if (allow.current) return replace.call(inst, u, as, o);
      ask(typeof as === "string" ? as : asString(u)); return Promise.resolve(false);
    };
    // browser Back and Forward: Next hands over history navigation, so restore the address and ask
    Router.beforePopState(({ as }) => {
      if (allow.current) return true;
      window.history.pushState(null, "", Router.asPath);
      ask(as);
      return false;
    });
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      inst.push = push; inst.replace = replace; Router.beforePopState(() => true);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [dirty, L]);

  return { allowLeave };
}
