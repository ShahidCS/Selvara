#!/usr/bin/env node
/* Refreshes src/server/data/disposableDomains.json from the disposable-email-domains blocklist (CC0-1.0). Run about monthly from front-end/,
   review the diff (a mainstream provider must never appear), then commit. Uses git, so the source commit is recorded with the list.
     node scripts/update-disposable-domains.mjs */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = "https://github.com/disposable-email-domains/disposable-email-domains.git";
const MAINSTREAM = ["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "proton.me", "protonmail.com", "aol.com", "gmx.com"];
const dir = mkdtempSync(join(tmpdir(), "dea-"));
try {
  execFileSync("git", ["clone", "-q", "--depth", "1", REPO, dir], { stdio: "inherit" });
  const commit = execFileSync("git", ["-C", dir, "log", "-1", "--format=%H"]).toString().trim();
  const date = execFileSync("git", ["-C", dir, "log", "-1", "--format=%cs"]).toString().trim();
  const domains = [...new Set(readFileSync(join(dir, "disposable_email_blocklist.conf"), "utf8").split("\n").map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith("#")))].sort();
  const bad = domains.find((d) => !/^[a-z0-9.-]+\.[a-z0-9-]+$/.test(d)); if (bad) throw new Error(`unexpected entry: ${bad}`);
  const main = domains.filter((d) => MAINSTREAM.includes(d)); if (main.length) throw new Error(`mainstream providers listed: ${main.join(", ")}`);
  const out = { source: "https://github.com/disposable-email-domains/disposable-email-domains (disposable_email_blocklist.conf)", commit, date, licence: "CC0-1.0", domains };
  writeFileSync(new URL("../src/server/data/disposableDomains.json", import.meta.url), JSON.stringify(out) + "\n");
  console.log(`${domains.length} domains at ${commit} (${date})`);
} finally { rmSync(dir, { recursive: true, force: true }); }
