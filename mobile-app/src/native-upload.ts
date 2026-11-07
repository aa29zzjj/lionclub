export const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const MAX_TTL_MS = 5 * 60_000;
const MAX_GRANTS = 16;
const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
type Grant = { contentType: string; size: number; epoch: number; expiresAt: number };
const invalid = () => new Error("圖片上傳資料已失效，請重新選擇圖片。");

function validSignedImageUrl(value: string, contentType: string, kind: "avatars" | "events") {
  if (value.length > 8192) throw invalid();
  let url: URL;
  try { url = new URL(value); } catch { throw invalid(); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) throw invalid();
  // Exact URL capabilities below supplement this standard S3 endpoint check.
  const host = url.hostname.match(/^(?:([a-z0-9][a-z0-9.-]*[a-z0-9])\.)?s3(?:\.([a-z]{2}-[a-z]+-\d))?\.amazonaws\.com$/);
  if (!host) throw invalid();
  const path = host[1] ? url.pathname : url.pathname.replace(/^\/[a-z0-9][a-z0-9.-]*[a-z0-9](?=\/)/, "");
  const extension = extensions[contentType];
  if (!extension || !new RegExp(`^/${kind}/[A-Za-z0-9_-]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.${extension}$`).test(path)) throw invalid();
  const one = (name: string) => {
    const values = url.searchParams.getAll(name);
    if (values.length !== 1 || !values[0]) throw invalid();
    return values[0];
  };
  if (one("X-Amz-Algorithm") !== "AWS4-HMAC-SHA256" || !/^[a-f0-9]{64}$/i.test(one("X-Amz-Signature"))
    || !/^\d{8}T\d{6}Z$/.test(one("X-Amz-Date")) || !one("X-Amz-SignedHeaders").split(";").includes("host")) throw invalid();
  const credential = one("X-Amz-Credential").match(/^[^/]+\/\d{8}\/([a-z]{2}-[a-z]+-\d)\/s3\/aws4_request$/);
  if (!credential || credential[1] !== (host[2] ?? "us-east-1")) throw invalid();
  const expires = Number(one("X-Amz-Expires"));
  if (!Number.isSafeInteger(expires) || expires <= 0 || expires > MAX_TTL_MS / 1000) throw invalid();
  return expires * 1000;
}

/** Memory-only, bounded, single-use capabilities from authenticated API calls.
 * No arbitrary caller URL can use the native HTTP bridge to bypass CSP. */
export function createImageUploadGrants(now: () => number = Date.now) {
  const grants = new Map<string, Grant>();
  const prune = (epoch: number) => {
    for (const [url, grant] of grants) if (grant.expiresAt <= now() || grant.epoch !== epoch) grants.delete(url);
  };
  return {
    register(url: string, contentType: string, size: number, epoch: number, kind: "avatars" | "events", expiresIn = 300) {
      if (!Number.isSafeInteger(size) || size <= 0 || size > IMAGE_UPLOAD_MAX_BYTES || !Number.isSafeInteger(epoch) || epoch < 0
        || !Number.isSafeInteger(expiresIn) || expiresIn <= 0) throw invalid();
      const urlTtl = validSignedImageUrl(url, contentType, kind);
      prune(epoch);
      if (!grants.has(url) && grants.size >= MAX_GRANTS) grants.delete(grants.keys().next().value!);
      grants.set(url, { contentType, size, epoch, expiresAt: now() + Math.min(MAX_TTL_MS, expiresIn * 1000, urlTtl) });
    },
    consume(url: string, contentType: string, size: number, epoch: number) {
      prune(epoch);
      const grant = grants.get(url);
      grants.delete(url); // Failed/mismatched attempts also require a fresh presign.
      if (!grant || grant.contentType !== contentType || grant.size !== size || grant.epoch !== epoch) throw invalid();
    },
  };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
