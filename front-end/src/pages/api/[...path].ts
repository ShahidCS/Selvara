import type { NextApiRequest, NextApiResponse } from "next";
import { handle } from "@/server/core";
import { clientAddress, deps } from "@/server/env";

/* The production authentication API (/api/...), contract in docs/security/CONTROLS.md. Off (503) unless the Supabase environment is set. */
export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };
const parseCookies = (h: string | undefined) => Object.fromEntries((h || "").split(";").map((c) => c.trim().split("=")).filter((x) => x.length === 2 && x[0]).map(([k, v]) => [k, decodeURIComponent(v)]));
export default async function api(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  const d = deps(); if (!d) { res.status(503).json({ error: "The server is not configured." }); return; }
  const path = ([] as string[]).concat(req.query.path || []).map(String);
  const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v]));
  const out = await handle(d, { method: String(req.method), path, body: req.body && typeof req.body === "object" ? req.body : {}, headers, cookies: parseCookies(req.headers.cookie), ip: clientAddress(req.headers, req.socket.remoteAddress) });
  if (out.cookies) res.setHeader("Set-Cookie", out.cookies);
  res.status(out.status);
  if (out.body === undefined) res.end(); else res.json(out.body);
}
