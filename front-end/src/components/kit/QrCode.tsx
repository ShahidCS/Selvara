import { useMemo } from "react";
import { encode } from "uqr";

/** A QR code drawn in the browser from `value` (an otpauth:// set-up URI). The value never leaves the page: no image service, no network,
 *  no innerHTML (the modules become one SVG path). Dark modules on a white quiet zone in both themes, because scanners need the contrast.
 *  `uqr` 0.1.3 (MIT, no dependencies) was security-reviewed before it was added: see docs/security/CONTROLS.md AUTH-15. */
export function QrCode({ value, size = 176, label }: { value: string; size?: number; label: string }) {
  const { d, n } = useMemo(() => {
    const q = encode(value, { ecc: "M", border: 4 });
    let path = "";
    q.data.forEach((row, y) => row.forEach((dark, x) => { if (dark) path += `M${x},${y}h1v1h-1z`; }));
    return { d: path, n: q.size };
  }, [value]);
  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" style={{ display: "block", borderRadius: 8 }}>
      <rect width={n} height={n} fill="#ffffff" />
      <path d={d} fill="#000000" />
    </svg>
  );
}
