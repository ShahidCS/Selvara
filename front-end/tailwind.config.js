/** Tailwind is used for layout/utility classes only. Colours, radii and shadows come from the
 *  original design tokens (CSS variables in src/styles/portal.css), mapped here so utilities
 *  and the legacy classes always agree. Preflight is OFF to keep the source's own base reset. */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)", surface: "var(--surface)", "surface-2": "var(--surface-2)", "surface-3": "var(--surface-3)",
        ink: "var(--ink)", "ink-2": "var(--ink-2)", muted: "var(--muted)", faint: "var(--faint)",
        line: "var(--line)", "line-2": "var(--line-2)",
        accent: "var(--accent)", "accent-weak": "var(--accent-weak)", "accent-ink": "var(--accent-ink)",
        ok: "var(--ok-ink)", warn: "var(--warn-ink)", bad: "var(--bad-ink)", info: "var(--info-ink)",
      },
      borderRadius: { control: "var(--radius-control)", chip: "var(--radius-chip)", card: "var(--radius-card)", modal: "var(--radius-modal)" },
      boxShadow: { sm2: "var(--shadow-sm)", md2: "var(--shadow)", lg2: "var(--shadow-lg)" },
      fontFamily: { sans: ["var(--font)"], display: ["var(--font-display)"] },
    },
  },
  plugins: [],
};
