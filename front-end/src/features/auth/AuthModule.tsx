import { useEffect, useRef, useState } from "react";
import { Icon, Page } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { AUTH_TABS, type AuthView } from "./authLogic";
import { AuthCard, Challenge, Create, Mfa, PanelApi, Reset, SetPassword, SignIn } from "./AuthPanels";
import { YourAccount } from "./YourAccount";
import { API_ON } from "@/lib/rbac";

/** Sign-in & Security "experience gallery" (prototype: REND.auth). Standalone page /auth. DEMO ONLY: no backend, nothing is sent or stored.
 *  Every panel is its own component keyed by view, so password / OTP / phone state is discarded whenever the view changes or the page unmounts. */
export default function AuthModule() {
  // Production: only the person's own account (from the server). The other tabs preview the sign-in screens with demonstration logic.
  if (API_ON) return <Page title="Your account" sub="Sign-in history, two-step verification, sessions and password"><div className="card"><div className="c-body scroll"><YourAccount /></div></div></Page>;
  return <Gallery />;
}

function Gallery() {
  const L = useLayer();
  const [view, setView] = useState<AuthView>("account"); const [mfa, setMfa] = useState<string | null>(null);
  const after = useRef<null | (() => void)>(null);
  useEffect(() => { const f = after.current; after.current = null; f?.(); }, [view, mfa]);
  const onTab = AUTH_TABS.some((t) => t[0] === view);
  const go = (v: AuthView, focus?: () => void) => {
    after.current = focus || (() => document.getElementById("authtab-" + v)?.focus()); // prototype: authGo focuses the tab
    setView(v); if (v !== "mfa") setMfa(null);
  };
  const api: PanelApi = { go, toast: (m) => L.toast(m) };
  const tabKey = (e: React.KeyboardEvent) => {
    const k = AUTH_TABS.map((t) => t[0]); let i = k.indexOf(view); if (i < 0) i = 0;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") i = (i + 1) % k.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") i = (i - 1 + k.length) % k.length;
    else if (e.key === "Home") i = 0; else if (e.key === "End") i = k.length - 1; else return;
    e.preventDefault(); go(k[i] as AuthView);
  };
  const pickMfa = (m: string) => { after.current = () => (document.querySelector("#authBody form input, #authBody .btn-primary") as HTMLElement | null)?.focus(); setMfa(m); };
  const lab = onTab ? { "aria-labelledby": "authtab-" + view } : { "aria-label": view === "resetpw" ? "Set a new password" : "Two-factor authentication" };
  return (
    <Page mod="auth" acts={view === "account" ? undefined : <span className="tag"><Icon name="access" />Preview</span>}>
      <div className="card">
        <div className="c-head" style={{ padding: "0 8px" }}>
          <div className="tabs" role="tablist" aria-label="Sign-in screens" onKeyDown={tabKey}>
            {AUTH_TABS.map((t) => {
              const sel = view === t[0]; const rove = sel || (!onTab && t[0] === AUTH_TABS[0][0]);
              return <button key={t[0]} className="tab" role="tab" id={"authtab-" + t[0]} aria-controls="authBody" aria-selected={sel} tabIndex={rove ? 0 : -1} onClick={() => go(t[0] as AuthView)}>{t[1]}</button>;
            })}
          </div>
        </div>
        <div className="c-body scroll" id="authBody" role="tabpanel" tabIndex={0} {...lab}>
          {view === "account" ? <YourAccount /> : <AuthCard>
            {view === "signin" ? <SignIn key="signin" api={api} />
              : view === "challenge" ? <Challenge key="challenge" api={api} />
              : view === "create" ? <Create key="create" api={api} />
              : view === "password" ? <SetPassword key="password" api={api} pfx="ap" />
              : view === "resetpw" ? <SetPassword key="resetpw" api={api} pfx="rp" />
              : view === "mfa" ? <Mfa key={"mfa" + (mfa || "")} api={api} method={mfa} pick={pickMfa} />
              : <Reset key="reset" api={api} />}
          </AuthCard>}
        </div>
      </div>
    </Page>
  );
}
