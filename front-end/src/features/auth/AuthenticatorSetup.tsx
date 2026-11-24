import { useState } from "react";
import { QrCode } from "@/components/kit/QrCode";
import { Segmented } from "@/components/ui";

/** Adding an authenticator app: scan the QR code, or type the set-up key by hand, or open the app on this device. The key and the QR are drawn
 *  in the browser from what the server returned once (never sent anywhere else, never stored in the page after it closes). */
export function AuthenticatorSetup({ secret, uri, email }: { secret: string; uri: string; email?: string }) {
  const [show, setShow] = useState<"qr" | "key">("qr"); const [copied, setCopied] = useState("");
  const grouped = secret.match(/.{1,4}/g)?.join(" ") ?? secret;
  const copy = async () => { try { await navigator.clipboard.writeText(secret); setCopied("Copied"); } catch { setCopied("Select the key and copy it"); } };
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ justifySelf: "start" }}><Segmented<"qr" | "key"> label="How to add Selvara to your app" value={show} onChange={setShow} options={[{ value: "qr", label: "Scan QR code" }, { value: "key", label: "Enter key manually" }]} /></div>
      {show === "qr" ? (
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <QrCode value={uri} label="QR code to add Selvara to your authenticator app" />
          <p style={{ margin: 0, fontSize: 13, maxWidth: "34ch", lineHeight: 1.5 }}>Open your authenticator app (such as Microsoft Authenticator, Google Authenticator or 1Password), choose to add an account, and scan this code.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
          <p style={{ margin: 0, lineHeight: 1.5 }}>In your authenticator app, choose to add an account and enter it manually: type the key below, choose <b>time-based</b>, 6 digits, every 30 seconds.</p>
          {email ? <div><span style={{ color: "var(--muted)" }}>Account name:</span> <span className="num">{email}</span></div> : null}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: "var(--muted)" }} id="as-key-l">Set-up key</span>
            <code className="num" aria-labelledby="as-key-l" style={{ fontWeight: 600, letterSpacing: ".06em", wordBreak: "break-all", padding: "4px 8px", borderRadius: 6, background: "var(--surface-2)" }}>{grouped}</code>
            <button type="button" className="btn btn-ghost sm" onClick={copy}>Copy key</button><span role="status" style={{ color: "var(--muted)" }}>{copied}</span>
          </div>
        </div>
      )}
      <p style={{ margin: 0, fontSize: 13 }}><a href={uri}>Open in an authenticator app on this device</a></p>
    </div>
  );
}
