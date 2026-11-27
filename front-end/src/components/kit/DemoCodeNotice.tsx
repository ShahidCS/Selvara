/* The demonstration build's one-time code notice (sign-in second step, and the passkey screen's demo fallback). Only the demonstration
   build (NEXT_PUBLIC_API_MODE unset or "mock") ever has a code to show: the production server never sends one (server/core.ts tickets are
   totp, enroll or passkey). Layout: the heading on its own line, then the statement, the code and an optional closing line, one line apart
   (a flex column with a 1em gap, styles .demo-code in portal.css). The code stays selectable text. */
export function DemoCodeNotice({ heading, statement, code, closing }: { heading: string; statement: string; code: string; closing?: string }) {
  return (
    <div className="banner warn demo-code" data-testid="demo-code-notice">
      <b className="demo-code-h">{heading}</b>
      <div className="demo-code-body">
        <span>{statement}</span>
        <span className="demo-code-value">{code}</span>
        {closing ? <span className="demo-code-tail">{closing}</span> : null}
      </div>
    </div>
  );
}
