import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/* SEC-10 (ASVS V5.3.4): every SQL statement passes values as parameters ($1, $2, ...). A template literal handed to query() may only interpolate
   the reviewed, code-chosen fragments below (constants, clamped integers, fixed WHERE fragments). Anything new fails here until reviewed. */
const REVIEWED = new Set([
  "LOG_LIMIT",                                  // support.ts: a constant
  "Math.min(Math.max(1, limit | 0), 500)",      // platform.ts: an integer clamped to 1..500
  "where",                                      // helpdesk.ts: one of fixed "where ... = $1" fragments chosen by the caller
  'tenantId ? "and tenant_id = $2" : ""',       // platstore.ts: a fixed fragment with its own parameter
  'read ? "" : " for update"',                  // platstore.ts: a row lock or not
  "LIMIT",                                      // directory.ts: a constant
  `tenantId ? "a.tenant_id = $1 and a.domain = 'ws'" : "a.tenant_id is null and $1::uuid is null and a.domain = 'admin'"`, // directory.ts: two fixed WHERE fragments
  'id ? "for update of a" : ""',                // directory.ts: a row lock or not
]);
const SRC = path.resolve(__dirname, "../../src/server");
const files = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(d, e.name)) : e.name.endsWith(".ts") ? [path.join(d, e.name)] : []));

describe("SEC-10: parameterised SQL only", () => {
  it("no query interpolates anything but reviewed, code-chosen fragments", () => {
    const found: string[] = [];
    for (const f of files(SRC)) {
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(/\.query\(\s*`([^`]*)`/g)) for (const x of m[1].matchAll(/\$\{([^}\n]*)\}/g)) {
        if (!REVIEWED.has(x[1].trim())) found.push(`${path.relative(SRC, f)}: \${${x[1]}}`);
      }
    }
    expect(found).toEqual([]);
  });
});
