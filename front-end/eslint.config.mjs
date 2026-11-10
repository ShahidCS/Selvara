// ESLint flat config. Next.js 16 removed `next lint`, so `npm run lint` calls ESLint directly.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// react-hooks/set-state-in-effect still has one known violation, in src/lib/elevation.ts (a protected file: the elevated-session
// clock sets state when the session starts). It is a warning, and `npm run lint` caps the warning count (see package.json) so a
// second one fails. Fix it and drop this entry. Every other rule, including react-hooks/immutability, is an error.
const LEGACY = ["react-hooks/set-state-in-effect"];

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  { rules: Object.fromEntries(LEGACY.map((r) => [r, "warn"])) },
  // Node dev scripts are CommonJS: require() is how they load modules.
  { files: ["scripts/**/*.js"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  {
    ignores: [".next/**", "node_modules/**", "out/**", "playwright-report/**", "test-results/**", "next-env.d.ts"],
  },
];

export default config;
