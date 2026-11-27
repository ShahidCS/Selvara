import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/* EDGE-13: text follows the browser's text-size setting. Type sizes are in rem (1rem = 16px at the default setting), never px: the
   stylesheets' font-size and line-height, the type token, and React style objects (a number there is px). Two files keep px on purpose:
   the e-mail templates (rem is unreliable in e-mail clients) and the board pack (a printed document laid out for A4). */
const SRC = path.resolve(__dirname, "../../src");
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const PX_ALLOWED = new Set(["server/mail.ts", "features/overview/lib/boardPack.ts"]);
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/");

describe("EDGE-13: type sizes in rem", () => {
  it("no stylesheet sets font-size or line-height in px", () => {
    const found: string[] = [];
    for (const f of walk(SRC).filter((f) => f.endsWith(".css"))) {
      fs.readFileSync(f, "utf8").split("\n").forEach((l, i) => { for (const m of l.matchAll(/(font-size|line-height)\s*:\s*[0-9.]+px/g)) found.push(`${rel(f)}:${i + 1} ${m[0]}`); });
    }
    expect(found).toEqual([]);
  });

  it("no React style sets fontSize as a number (React adds px)", () => {
    const found: string[] = [];
    for (const f of walk(SRC).filter((f) => /\.(tsx?|jsx?)$/.test(f) && !PX_ALLOWED.has(rel(f)))) {
      fs.readFileSync(f, "utf8").split("\n").forEach((l, i) => { for (const m of l.matchAll(/fontSize\s*:\s*(?:[^,}"'`]*\?\s*)?[0-9.]+(?![0-9.]*\s*["'`])/g)) found.push(`${rel(f)}:${i + 1} ${m[0]}`); });
    }
    expect(found).toEqual([]);
  });

  it("the body size, the help-text token and the top bar height are rem", () => {
    const css = fs.readFileSync(path.join(SRC, "styles/portal.css"), "utf8");
    expect(css).toMatch(/body\{[^}]*font-size:\.875rem/);
    expect(css).toMatch(/--fs-help:\.8125rem/);
    expect([...css.matchAll(/--topbar-h:([^;}]+)/g)].map((m) => m[1])).toEqual(["3.5rem", "3.75rem"]);
  });
});
