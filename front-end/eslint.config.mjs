// ESLint flat config. Next.js 16 removed `next lint`, so `npm run lint` calls ESLint directly.
// No rule is downgraded: any warning or error fails `npm run lint` (--max-warnings=0 in package.json).
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  // Node dev scripts are CommonJS: require() is how they load modules.
  { files: ["scripts/**/*.js"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  {
    ignores: [".next/**", "node_modules/**", "out/**", "playwright-report/**", "test-results/**", "next-env.d.ts"],
  },
];

export default config;
