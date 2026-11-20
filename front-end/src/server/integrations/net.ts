/* Server-only. What the connectors share (production programme group 7): an HTTPS client with a timeout that never follows a redirect to
   another host, RS256 JWTs (GitHub App, Okta private-key JWT, Google service account) and AWS Signature Version 4. No SDK: dependencies are
   managed by Dependabot and adding one needs the owner's approval. Every host a connector calls is fixed by the connector (or, for Okta,
   validated against Okta's own domains), so no company input can point the server at an internal address. Tokens live in memory only. */
import { createHash, createHmac, createPrivateKey, generateKeyPairSync, randomUUID, sign } from "node:crypto";

export interface NetResponse { status: number; headers: Record<string, string>; text: string }
export interface NetRequest { method?: string; headers?: Record<string, string>; body?: string }
/** The network as the connectors see it; tests use a stand-in. */
export type Net = (url: string, init?: NetRequest) => Promise<NetResponse>;
export class ProviderError extends Error { constructor(msg: string, public status = 0) { super(msg); } }

export const httpsNet: Net = async (url, init = {}) => {
  if (!url.startsWith("https://")) throw new ProviderError("Only https is used.");
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 15_000);
  try {
    const res = await fetch(url, { method: init.method ?? "GET", headers: { "user-agent": "Selvara-Integrations/1", ...(init.headers ?? {}) }, body: init.body, redirect: "manual", signal: ctl.signal });
    const headers: Record<string, string> = {}; res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    return { status: res.status, headers, text: await res.text() };
  } catch { throw new ProviderError("The provider did not answer in time."); }
  finally { clearTimeout(timer); }
};
export const json = <T,>(r: NetResponse): T => { try { return JSON.parse(r.text) as T; } catch { throw new ProviderError("The provider sent an unexpected answer.", r.status); } };
/** The provider's refusal in plain words (status only: provider messages can echo identifiers). */
export function failed(what: string, r: NetResponse): never {
  const why = r.status === 401 ? "the credentials were refused" : r.status === 403 ? "permission is missing" : r.status === 404 ? "it was not found" : r.status === 429 ? "the provider's rate limit was reached" : `the provider answered ${r.status}`;
  throw new ProviderError(`${what}: ${why}.`, r.status);
}

/* ---- JWT (RS256) ---- */
const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");
/** Environment variables often hold a PEM with literal "\n". */
export const pem = (v: string) => v.replace(/\\n/g, "\n");
export function jwtRS256(claims: Record<string, unknown>, privateKeyPem: string, kid?: string) {
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT", ...(kid ? { kid } : {}) }));
  const body = b64u(JSON.stringify(claims));
  const sig = sign("RSA-SHA256", Buffer.from(`${head}.${body}`), createPrivateKey(pem(privateKeyPem)));
  return `${head}.${body}.${b64u(sig)}`;
}
/** A new RSA key pair for one company's Okta service app: the public key as a JWK to register in Okta, the private key to seal. */
export function newKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = randomUUID();
  const jwk = { ...(publicKey.export({ format: "jwk" }) as Record<string, string>), kid, use: "sig", alg: "RS256" };
  return { kid, jwk, privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString() };
}

/* ---- AWS Signature Version 4 ---- */
export interface AwsCreds { accessKeyId: string; secretAccessKey: string; sessionToken?: string }
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const hmac = (k: Buffer | string, s: string) => createHmac("sha256", k).update(s).digest();
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
/** Signs a request (headers returned to send with it). `amzDate` is YYYYMMDD'T'HHMMSS'Z'. */
export function sigV4(req: { method: string; url: string; headers: Record<string, string>; body: string }, creds: AwsCreds, region: string, service: string, amzDate: string) {
  const u = new URL(req.url); const date = amzDate.slice(0, 8);
  const headers: Record<string, string> = { ...Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), v.trim()])), host: u.host, "x-amz-date": amzDate };
  if (creds.sessionToken) headers["x-amz-security-token"] = creds.sessionToken;
  const names = Object.keys(headers).sort();
  const query = [...u.searchParams.entries()].map(([k, v]) => [enc(k), enc(v)]).sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("&");
  const path = u.pathname.split("/").map((p) => enc(decodeURIComponent(p))).join("/") || "/";
  const canonical = [req.method, path, query, names.map((n) => `${n}:${headers[n]}\n`).join(""), names.join(";"), sha256(req.body)].join("\n");
  const scope = `${date}/${region}/${service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${creds.secretAccessKey}`, date), region), service), "aws4_request");
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}` };
}
export const amzDateOf = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** The text of the first <tag> in an XML answer (AWS query APIs answer in XML; only a few known fields are read). */
export const xmlTag = (xml: string, tag: string) => { const m = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml); return m ? m[1] : null; };
