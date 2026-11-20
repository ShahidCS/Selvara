/* Server-only. Evidence file storage (production programme decision: real storage). Supabase Storage, a PRIVATE bucket the owner creates
   (docs/guides/SUPABASE.md section 4d), reached only by the server with the service key: files are stored under the company's id, never served
   from Selvara's own origin (downloads are short-lived signed links to the storage domain, sent as attachments), and checked before they are
   stored: an allowed extension, a size limit, and content that matches the extension (magic bytes, or valid text). */
import { createClient } from "@supabase/supabase-js";
import { EVIDENCE_FILE_MAX, EVIDENCE_FILE_TYPES } from "@/lib/rulesWs";
import { safeFileName } from "@/lib/security";
import { upstream } from "../errors";

export interface FileStore {
  /** False when the bucket is not configured: uploads are refused with a clear message, nothing else breaks. */
  readonly configured: boolean;
  put(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** A signed link valid for `seconds`, served as a download named `name`. */
  link(path: string, name: string, seconds: number): Promise<string>;
  remove(paths: string[]): Promise<void>;
}

export class SupabaseFileStore implements FileStore {
  readonly configured: boolean;
  constructor(private env: { url: string; serviceKey: string }, private bucket: string | undefined) { this.configured = !!bucket; }
  private client() { return createClient(this.env.url, this.env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from(String(this.bucket)); }
  async put(path: string, bytes: Uint8Array, contentType: string) {
    const { error } = await this.client().upload(path, bytes, { contentType, upsert: false, cacheControl: "no-store" });
    if (error) throw upstream("storage.upload", error);
  }
  async link(path: string, name: string, seconds: number) {
    const { data, error } = await this.client().createSignedUrl(path, seconds, { download: name });
    if (error || !data?.signedUrl) throw upstream("storage.sign", error ?? {});
    return data.signedUrl;
  }
  async remove(paths: string[]) { if (!paths.length) return; const { error } = await this.client().remove(paths); if (error) throw upstream("storage.remove", error); }
}

export class MemoryFileStore implements FileStore {
  readonly configured = true;
  files = new Map<string, { bytes: Uint8Array; type: string }>();
  async put(path: string, bytes: Uint8Array, type: string) { if (this.files.has(path)) throw new Error("exists"); this.files.set(path, { bytes, type }); }
  async link(path: string, name: string, seconds: number) { return `https://storage.example.test/${encodeURIComponent(path)}?download=${encodeURIComponent(name)}&expires=${seconds}`; }
  async remove(paths: string[]) { for (const p of paths) this.files.delete(p); }
}

const starts = (b: Uint8Array, sig: number[]) => sig.every((x, i) => b[i] === x);
const ZIP = [0x50, 0x4b, 0x03, 0x04];
/** Why this file may not be stored, or null with its safe name, extension and content type. */
export function checkFile(name: unknown, bytes: Uint8Array): { error: string } | { name: string; ext: string; type: string } {
  const safe = safeFileName(name, "");
  const ext = (safe.includes(".") ? safe.split(".").pop() || "" : "").toLowerCase();
  const type = EVIDENCE_FILE_TYPES[ext];
  if (!safe) return { error: "File name is required." };
  if (!type) return { error: `File type “.${ext || "?"}” is not allowed. Allowed: ${Object.keys(EVIDENCE_FILE_TYPES).join(", ")}.` };
  if (!bytes.length) return { error: "File is empty." };
  if (bytes.length > EVIDENCE_FILE_MAX) return { error: `File is too large (max ${EVIDENCE_FILE_MAX / 1024 / 1024} MB).` };
  const okContent = ext === "pdf" ? starts(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])
    : ext === "png" ? starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    : ext === "jpg" || ext === "jpeg" ? starts(bytes, [0xff, 0xd8, 0xff])
    : ext === "docx" || ext === "xlsx" ? starts(bytes, ZIP)
    : isText(bytes);
  if (!okContent) return { error: `The file's content is not a valid .${ext} file.` };
  return { name: safe, ext, type };
}
function isText(b: Uint8Array): boolean {
  if (b.includes(0)) return false;
  try { new TextDecoder("utf-8", { fatal: true }).decode(b); return true; } catch { return false; }
}
