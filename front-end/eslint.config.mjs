// ESLint flat config. Next.js 16 removed `next lint`, so `npm run lint` calls ESLint directly.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Rules the code migrated from the prototype still breaks in places. They are reported as warnings, and
// `npm run lint` caps the warning count (see package.json) so the number can only go down, never up.
// Fix a violation, lower the cap. Everything not listed here is an error.
const LEGACY = [
  "@typescript-eslint/no-explicit-any",
  "@typescript-eslint/no-unused-vars",
  "@typescript-eslint/no-require-imports",
  "react-hooks/immutability",
  "react-hooks/set-state-in-effect",
  "react/display-name",
  "prefer-const",
  "@next/next/no-html-link-for-pages",
  "@next/next/no-location-assign-relative-destination",
];

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  { rules: Object.fromEntries(LEGACY.map((r) => [r, "warn"])) },
  {
    ignores: [".next/**", "node_modules/**", "out/**", "playwright-report/**", "test-results/**", "next-env.d.ts"],
  },
];

export default config;
