import { ELEV_REASON_MIN, validTicket } from "@/lib/elevation";

export const reasonTicketOk = (reason: string, ticket: string) => reason.trim().length >= ELEV_REASON_MIN && validTicket(ticket.trim());

/** Reason (>= 15 chars) and ticket reference (e.g. FIN-1234) inputs recorded in the audit log. `p` keeps ids unique per form. */
export function ReasonTicket({ p, reason, setReason, ticket, setTicket }: { p: string; reason: string; setReason: (v: string) => void; ticket: string; setTicket: (v: string) => void }) {
  const tBad = !!ticket && !validTicket(ticket.trim());
  return (
    <>
      <div className="field" style={{ marginTop: 12 }}><label htmlFor={p + "Reason"}>Reason (at least {ELEV_REASON_MIN} characters)</label><textarea className="input" id={p + "Reason"} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <div className={"field" + (tBad ? " err" : "")} style={{ marginTop: 12 }}><label htmlFor={p + "Ticket"}>Ticket reference</label>
        <input className="input" id={p + "Ticket"} maxLength={12} autoComplete="off" placeholder="FIN-1234" aria-invalid={tBad} value={ticket} onChange={(e) => setTicket(e.target.value.toUpperCase())} />
        <span className="help">{tBad ? "Use 2 to 6 capital letters, a dash and up to 6 digits." : "Both are written to the Audit Logs."}</span></div>
    </>
  );
}
