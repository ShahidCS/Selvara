// ESLint flat config. Next.js 16 removed `next lint`, so `npm run lint` calls ESLint directly.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Two React rules the code migrated from the prototype still breaks in places. Both need real refactoring, not tidying:
//  - react-hooks/immutability: forms mutate a shared state object in place (controls modals, framework detail/add, vendor portal)
//  - react-hooks/set-state-in-effect: effects that set state synchronously (sidebar, auth panels, support grants, elevation)
// They are warnings, and `npm run lint` caps the warning count (see package.json) so the number can only go down.
// Fix a violation, lower the cap. Every other rule is an error.
const LEGACY = ["react-hooks/immutability", "react-hooks/set-state-in-effect"];

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
