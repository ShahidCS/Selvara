import { forwardRef, useState } from "react";
import { Icon } from "@/components/ui";
import { EMAIL_RE, EmailState, emailMessage, emailState } from "./authLogic";

/** Prototype: authPwField. Real `type=password` with a show/hide toggle; paste is not blocked; no spell-check / autocorrect; no maxLength (a silent cap would truncate: over-long values get an error instead). */
export const PwField = forwardRef<HTMLInputElement, { id: string; label: string; ac: "current-password" | "new-password"; value: string; onChange: (v: string) => void; invalid?: boolean; describedBy?: string }>(
  function PwField({ id, label, ac, value, onChange, invalid, describedBy }, ref) {
    const [show, setShow] = useState(false);
    return (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <div className="pw-wrap">
          <input ref={ref} className="input" id={id} type={show ? "text" : "password"} autoComplete={ac} spellCheck={false} autoCapitalize="off" autoCorrect="off" style={{ paddingRight: 40 }}
            value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid ? true : undefined} aria-describedby={describedBy} />
          <button type="button" className={`pw-toggle${show ? " on" : ""}`} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={() => setShow((s) => !s)}><Icon name="eye" /></button>
        </div>
      </div>
    );
  });

/** Prototype: authEmailField + authEmailCheck. `forced` flips on a failed submit (the parent sets it through `forceKey`). */
export const EmailField = forwardRef<HTMLInputElement, { id: string; label: string; value: string; onChange: (v: string) => void; forced: boolean; onTouch: () => void }>(
  function EmailField({ id, label, value, onChange, forced, onTouch }, ref) {
    const st: EmailState = emailState(value, forced);
    return (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <div className="in-wrap">
          <input ref={ref} className={`input${st === "ok" ? " ok" : st === "bad" ? " bad" : ""}`} id={id} type="email" autoComplete="username" spellCheck={false} maxLength={254} placeholder="name@company.example" style={{ paddingRight: 38 }}
            value={value} onChange={(e) => { onTouch(); onChange(e.target.value); }} aria-invalid={st === "bad" ? true : undefined} aria-describedby={st === "bad" ? `${id}-err` : undefined} />
          <span className={`in-valid${st === "none" ? "" : " " + st}`} aria-hidden="true">{st === "ok" ? <Icon name="check" /> : st === "bad" ? <Icon name="alert" /> : null}</span>
        </div>
        <p className="field help in-err" id={`${id}-err`} role="alert" style={{ color: "var(--bad-ink)", display: st === "bad" ? "block" : "none", marginTop: 6 }}>{st === "bad" ? emailMessage(value) : ""}</p>
      </div>
    );
  });
export const emailValid = (v: string) => EMAIL_RE.test(v.trim());

/** Prototype: authErrP. */
export function ErrP({ id, msg, mt = 8 }: { id: string; msg: string; mt?: number }) {
  return <p className="field help" id={id} role="alert" style={{ color: "var(--bad-ink)", display: msg ? "block" : "none", marginTop: mt }}>{msg}</p>;
}
