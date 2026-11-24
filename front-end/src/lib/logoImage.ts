/* Vendor logos (reference review R14). A logo is stored as a small PNG data URL on the vendor record. In the browser, any accepted image
   (PNG, JPEG or WebP, up to 2 MB) is decoded and redrawn onto a 128 by 128 canvas and saved as a new PNG: metadata is dropped and anything that is
   not a picture (an SVG with script, a polyglot file) never survives. The server accepts only a PNG data URL of at most 64 KB that starts
   with the PNG signature. SVG is never accepted. */
export const LOGO_PX = 128;
export const LOGO_MAX_BYTES = 64 * 1024;
export const LOGO_UPLOAD_MAX = 2 * 1024 * 1024;
export const LOGO_ACCEPT = "image/png,image/jpeg,image/webp";
const PREFIX = "data:image/png;base64,";
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** True for a PNG data URL within the size limit whose bytes start with the PNG signature. Runs in the browser and on the server. */
export function isLogoDataUrl(v: unknown): v is string {
  if (typeof v !== "string" || !v.startsWith(PREFIX)) return false;
  const b64 = v.slice(PREFIX.length);
  if (!b64 || b64.length > Math.ceil(LOGO_MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length % 4 !== 0) return false;
  let head: string; try { head = atob(b64.slice(0, 12)); } catch { return false; }
  return PNG_SIG.every((x, i) => head.charCodeAt(i) === x);
}

/** Browser only: the picked image redrawn as a 128px PNG data URL, or an Error that says why it was refused. */
export async function makeLogo(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPEG or WebP image.");
  if (file.size > LOGO_UPLOAD_MAX) throw new Error("The image is larger than 2 MB.");
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file); } catch { throw new Error("The image could not be read."); }
  const canvas = document.createElement("canvas"); canvas.width = LOGO_PX; canvas.height = LOGO_PX;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("The image could not be read.");
  const k = Math.min(LOGO_PX / bmp.width, LOGO_PX / bmp.height); const w = Math.round(bmp.width * k); const h = Math.round(bmp.height * k);
  ctx.drawImage(bmp, Math.round((LOGO_PX - w) / 2), Math.round((LOGO_PX - h) / 2), w, h); bmp.close();
  const url = canvas.toDataURL("image/png");
  if (!isLogoDataUrl(url)) throw new Error("The logo is too detailed to store. Try a simpler image.");
  return url;
}
