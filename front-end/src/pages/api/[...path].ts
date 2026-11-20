import type { NextApiRequest, NextApiResponse } from "next";
import { handle } from "@/server/core";
import { clientAddress, deps } from "@/server/env";
import { EVIDENCE_FILE_MAX } from "@/lib/rulesWs";

/* The production API (/api/...), contract in docs/security/CONTROLS.md. Off (503) unless the Supabase environment is set.
   Bodies are read here, not by Next.js: JSON up to 16 KB everywhere, and the raw bytes of an evidence file (at most 4 MB) only on
   POST /api/ws/evidence/<id>/files with Content-Type application/octet-stream and the file name in ?name=, and up to 96 KB of JSON to add a framework. The handlers check the rest. */
export const config = { api: { bodyParser: false } };
const JSON_MAX = 16 * 1024;
/** Adding a framework carries up to 300 requirement lines of 200 characters. */
const LARGE_JSON: Record<string, number> = { "POST ws/frameworks": 96 * 1024 };
const parseCookies = (h: string | undefined) => Object.fromEntries((h || "").split(";").map((c) => c.trim().split("=")).filter((x) => x.length === 2 && x[0]).map(([k, v]) => [k, decodeURIComponent(v)]));
async function readBody(req: NextApiRequest, max: number): Promise<Buffer | null> {
  const parts: Buffer[] = []; let n = 0;
  for await (const chunk of req) { const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); n += b.length; if (n > max) return null; parts.push(b); }
  return Buffer.concat(parts);
}
const isUpload = (method: string | undefined, path: string[]) => method === "POST" && path.length === 4 && path[0] === "ws" && path[1] === "evidence" && path[3] === "files";
export default async function api(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  const d = deps(); if (!d) { res.status(503).json({ error: "The server is not configured." }); return; }
  const path = ([] as string[]).concat(req.query.path || []).map(String);
  const upload = isUpload(req.method, path) && req.headers["content-type"] === "application/octet-stream";
  let body: Record<string, unknown> = {}; let raw: Uint8Array | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const buf = await readBody(req, upload ? EVIDENCE_FILE_MAX : LARGE_JSON[`${req.method} ${path.join("/")}`] ?? JSON_MAX);
    if (!buf) { res.status(413).json({ error: upload ? `File is too large (max ${EVIDENCE_FILE_MAX / 1024 / 1024} MB).` : "Request too large." }); return; }
    if (upload) { raw = new Uint8Array(buf); body = { name: String(req.query.name ?? "").slice(0, 200) }; }
    else if (buf.length) {
      try { const v = JSON.parse(buf.toString("utf8")); body = v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
      catch { res.status(400).json({ error: "Send valid JSON." }); return; }
    }
  }
  const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v]));
  const out = await handle(d, { method: String(req.method), path, body, raw, headers, cookies: parseCookies(req.headers.cookie), ip: clientAddress(req.headers, req.socket.remoteAddress) });
  if (out.cookies) res.setHeader("Set-Cookie", out.cookies);
  res.status(out.status);
  if (out.body === undefined) res.end(); else res.json(out.body);
}
