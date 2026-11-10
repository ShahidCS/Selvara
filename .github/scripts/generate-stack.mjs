#!/usr/bin/env node
// Generates docs/architecture/STACK.md, the technology stack and exact versions, from the files that define it:
//   front-end/package.json + front-end/package-lock.json   application and tooling packages (declared and installed versions)
//   .github/vercel-cli/package.json + its lock             isolated deploy tooling
//   front-end/tsconfig.json                                TypeScript settings
//   .github/workflows/ci.yml                               Node.js version and runner image used by CI
//   .github/dependabot.yml                                 major versions that are deliberately not adopted
// Deterministic (sorted, no timestamps) so it can be checked in CI. Run from the repository root.
//   node .github/scripts/generate-stack.mjs            write the file
//   node .github/scripts/generate-stack.mjs --check    exit 1 if the committed file is out of date, or a package has no description
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const OUT = "docs/architecture/STACK.md";
const json = (p) => JSON.parse(readFileSync(p, "utf8"));

// What each package is for. A package missing here is reported (and fails --check) so the table never silently loses a description.
const ROLES = {
  next: "Web framework: Pages Router, server rendering, build and dev server",
  react: "UI library",
  "react-dom": "React renderer for the browser",
  typescript: "Type checking (tsc --noEmit); the build does not emit with it",
  tailwindcss: "Utility CSS for layout, mapped to the original design tokens (preflight disabled)",
  postcss: "CSS processing used by Tailwind and Next.js",
  autoprefixer: "Vendor prefixes, driven by the browserslist below",
  eslint: "Linting (flat config; see the lint script for the warning limit)",
  "eslint-config-next": "Next.js, React and React Hooks lint rules",
  vitest: "Unit tests",
  "@playwright/test": "End-to-end browser tests (Chromium)",
  "@types/node": "Type definitions for Node.js APIs",
  "@types/react": "Type definitions for React",
  "@types/react-dom": "Type definitions for React DOM",
  vercel: "Vercel CLI: builds and deploys the prebuilt output (runs only in the deploy workflows)",
};

const lockVersion = (lock, name) => lock.packages?.[`node_modules/${name}`]?.version ?? "not installed";
const missing = [];
const table = (pkgs, lock) => {
  const rows = Object.keys(pkgs).sort().map((name) => {
    const role = ROLES[name];
    if (!role) missing.push(name);
    return `| \`${name}\` | ${role ?? "(not described: add it to ROLES in .github/scripts/generate-stack.mjs)"} | \`${pkgs[name]}\` | \`${lockVersion(lock, name)}\` |`;
  });
  return ["| Package | Used for | Declared | Installed |", "| --- | --- | --- | --- |", ...rows].join("\n");
};

const app = json("front-end/package.json");
const appLock = json("front-end/package-lock.json");
const deploy = json(".github/vercel-cli/package.json");
const deployLock = json(".github/vercel-cli/package-lock.json");
const ts = json("front-end/tsconfig.json").compilerOptions ?? {};
const ci = readFileSync(".github/workflows/ci.yml", "utf8");
const ignored = [...readFileSync(".github/dependabot.yml", "utf8").matchAll(/dependency-name:\s*"?([^"\s]+)"?/g)].map((m) => m[1]);
const nodes = [...new Set([...ci.matchAll(/node-version:\s*"?([\w.]+)"?/g)].map((m) => m[1]))].sort();
const runners = [...new Set([...ci.matchAll(/runs-on:\s*(\S+)/g)].map((m) => m[1]))].sort();

const md = `# Technology stack

> **Generated** by \`.github/scripts/generate-stack.mjs\` from \`front-end/package.json\`, \`front-end/package-lock.json\`,
> \`.github/vercel-cli/package.json\`, \`front-end/tsconfig.json\`, \`.github/workflows/ci.yml\` and \`.github/dependabot.yml\`. Do not edit it by hand:
> run \`node .github/scripts/generate-stack.mjs\` from the repository root after changing any of those files.
> "Declared" is the version or range in \`package.json\`; "Installed" is what the lockfile resolves.
> For what the product is and why it is built this way, see the Tech stack section of the [README](../../README.md).

## Runtime and platform

| Item | Value |
| --- | --- |
| Node.js used by CI, builds and releases | ${nodes.join(", ")} |
| CI runner image | ${runners.map((r) => `\`${r}\``).join(", ")} |
| Package manager | npm (\`package-lock.json\`; installs use \`--ignore-scripts\`) |
| Application name / version | \`${app.name}\` ${app.version} (private, not published) |
| TypeScript \`strict\` | ${ts.strict === true ? "on" : "**off**"} (\`front-end/tsconfig.json\`); \`noImplicitAny\`: ${ts.noImplicitAny === true ? "on" : "off"} |
| TypeScript target / module resolution | \`${ts.target}\` / \`${ts.moduleResolution}\` |
| Browser support (\`browserslist\`) | ${(app.browserslist ?? []).map((b) => `\`${b}\``).join(", ")} |

## Application (shipped to users)

\`dependencies\` in \`front-end/package.json\`.

${table(app.dependencies ?? {}, appLock)}

## Build, test and quality tooling

\`devDependencies\` in \`front-end/package.json\`. Not part of what is delivered to users.

${table(app.devDependencies ?? {}, appLock)}

## Deploy tooling

\`.github/vercel-cli/package.json\`: an isolated install, kept apart from the application so the deploy token never meets application code.

${table(deploy.dependencies ?? {}, deployLock)}

## Related

- Production dependencies with their licences: [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) (also generated).
- CI/CD pipeline, scanners and pinned GitHub Actions: [docs/security/PIPELINE.md](../security/PIPELINE.md).
- Major versions Dependabot is told to ignore (each needs a planned migration, so these stay on their current major): ${ignored.length ? [...new Set(ignored)].sort().map((n) => `\`${n}\``).join(", ") : "none"}. See \`.github/dependabot.yml\`.
`;

if (missing.length) console.error(`Packages without a description: ${[...new Set(missing)].join(", ")}`);
if (process.argv.includes("--check")) {
  const same = existsSync(OUT) && readFileSync(OUT, "utf8") === md;
  if (!same) console.error(`${OUT} is out of date. Run: node .github/scripts/generate-stack.mjs`);
  process.exit(same && !missing.length ? 0 : 1);
}
writeFileSync(OUT, md);
console.log(`Wrote ${OUT}`);
process.exit(missing.length ? 1 : 0);
