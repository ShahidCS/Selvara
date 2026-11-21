/** The Selvara two-square mark (sidebar, sign-in, sign-in previews). Colours are tokens: the ring is the accent, the square is `--brand-mark`. */
export function BrandMark({ size = 26, className = "mark" }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 30 30" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="6" stroke="var(--accent)" strokeWidth="2.4" />
      <rect x="14" y="14" width="13" height="13" rx="4" fill="var(--brand-mark)" />
    </svg>
  );
}
