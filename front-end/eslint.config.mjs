// ESLint flat config. Next.js 16 removed `next lint`, so `npm run lint` calls ESLint directly.
// No rule is downgraded: any warning or error fails `npm run lint` (--max-warnings=0 in package.json).
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { readdirSync, statSync } from "node:fs";

// Feature boundaries (src/features/<name>/). A feature may use shared code (lib, services, components,
// hooks, data) and another feature's public API (`@/features/<name>`, its index.ts), never a deeper path of
// another feature. Shared code does not import features at all. Pages and the registry take index files only.
const featureNames = readdirSync("src/features").filter((n) => statSync(`src/features/${n}`).isDirectory());
const MAX_DEPTH = 4;
const deepFeature = (own) => ({
  group: own ? ["@/features/*/**", `!@/features/${own}/**`] : ["@/features/*/**"],
  message: "Import another feature through its public API (@/features/<name>), not a deeper path.",
});
const featureBoundaries = featureNames.flatMap((name) =>
  Array.from({ length: MAX_DEPTH }, (_, i) => i + 1).map((depth) => ({
    files: [`src/features/${name}/${"*/".repeat(depth - 1)}*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            deepFeature(name),
            { group: [`${"../".repeat(depth)}**`], message: "Do not reach into another feature with a relative path; use @/features/<name>." },
          ],
        },
      ],
    },
  })),
);

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  // Node dev scripts are CommonJS: require() is how they load modules.
  { files: ["scripts/**/*.js"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  ...featureBoundaries,
  {
    // Pages and the registry may use a feature index only.
    files: ["src/pages/**/*.{ts,tsx}", "src/features/registry.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [deepFeature(null)] }] },
  },
  {
    // Shared code must not depend on a feature.
    files: ["src/{lib,services,hooks,components,data}/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@/features", "@/features/**"], message: "Shared code must not import a feature. Move the shared part into src/lib or src/components/kit." }] },
      ],
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "out/**", "playwright-report/**", "test-results/**", "next-env.d.ts"],
  },
];

export default config;
