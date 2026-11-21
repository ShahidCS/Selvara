import icons from "@/data/icons.json";

/** coolicons (MIT, Kryston Schwarze). Node format: [paintType, pathData]; 0=stroke, 1=stroke@.4, 2=fill, 3=fill@.2, 4=fill@.4 */
type Node = [number, string];
/* Kit glyphs worth knowing: `dot` is a solid circle (neutral status), `alert` the circled exclamation, `excl` the bare mark (inside a dot that is
   already a circle), `blank` an empty slot (an unchecked menu option), plus `copy`, `print` and `unlock`. */
const IP = icons as unknown as Record<string, Node[]>;
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
