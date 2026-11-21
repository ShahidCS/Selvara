import icons from "@/data/icons.json";

/** coolicons (MIT, Kryston Schwarze). Node format: [paintType, pathData]; 0=stroke, 1=stroke@.4, 2=fill, 3=fill@.2, 4=fill@.4 */
type Node = [number, string];
/* Shared-kit overrides of the icon set:
   - `dot` was a stroked `h.01` point that rendered as a sub-pixel speck in a 12px chip; it is a solid 10/24 circle (5px in a chip).
   - `alert` was a bare "!" stroke that read as a thin tick at chip size; it is the circled exclamation (as the `issues` icon), so the icon half of
     "status is never colour alone" registers. `excl` keeps the bare mark for places that already draw the circle (the overdue stepper dot).
   - `blank` draws nothing and reserves the icon slot (an unchecked menu option), instead of a dot that reads as "selected". */
const OVERRIDES: Record<string, Node[]> = {
  dot: [[2, "M12 7a5 5 0 1 1 0 10a5 5 0 1 1 0-10Z"]],
  alert: [
    [3, "M3 12C3 7.029 7.029 3 12 3C16.971 3 21 7.029 21 12C21 16.971 16.971 21 12 21C7.029 21 3 16.971 3 12Z"],
    [0, "M3 12C3 16.97056 7.02944 21 12 21C16.97056 21 21 16.97056 21 12C21 7.02944 16.97056 3 12 3C7.02944 3 3 7.02944 3 12ZM12 8V13M12 16H12.01"],
  ],
  excl: [[0, "M12 6V14M12 18H12.01"]],
  blank: [],
};
const IP = { ...(icons as unknown as Record<string, Node[]>), ...OVERRIDES };
export const iconNames = Object.keys(IP);

export function Icon({ name, className, ...rest }: { name: string; className?: string } & React.SVGProps<SVGSVGElement>) {
  const n = IP[name] || IP.dot;
  return (
    <svg className={className || ""} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...rest}>
      {n.map(([t, d], i) =>
        t < 2 ? (
          <path key={i} d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeOpacity={t === 1 ? 0.4 : undefined} />
        ) : (
          <path key={i} d={d} fill="currentColor" fillOpacity={t === 3 ? 0.2 : t === 4 ? 0.4 : undefined} />
        )
      )}
    </svg>
  );
}
