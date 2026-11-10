import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

// iOS 15.0–15.3 lacks crypto.randomUUID; keep the declared iOS 15 minimum.
// A 128-bit CSPRNG nonce also avoids collisions between concurrent exports.
function exportNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Only this operation's private cache file is shared and removed. No member data is logged. */
export async function shareServiceFile(file: { filename: string; content: string }, current: () => boolean) {
  if (!current() || !/^[A-Za-z0-9._-]+\.md$/.test(file.filename) || file.content.length > 1000000) throw new Error("EXPORT_UNAVAILABLE");
  // Android recipients can read asynchronously after the chooser closes.
  // Clean only our nonce directories older than a day at the next export.
  const android = Capacitor.getPlatform() === "android";
  if (android) {
    const old = await Filesystem.readdir({ directory: Directory.Cache, path: "service-exports" }).catch(() => ({ files: [] }));
    for (const entry of old.files) if (/^[0-9]{13}-[0-9a-f-]{36}$/.test(entry.name) && Number(entry.name.slice(0, 13)) < Date.now() - 86400000) {
      await Filesystem.rmdir({ directory: Directory.Cache, path: `service-exports/${entry.name}`, recursive: true }).catch(() => {});
    }
  }
  if (!current()) throw new Error("EXPORT_UNAVAILABLE");
  const folder = `service-exports/${Date.now()}-${exportNonce()}`;
  const path = `${folder}/${file.filename}`;
  let shared = false;
  try {
    const result = await Filesystem.writeFile({ path, directory: Directory.Cache, data: file.content, encoding: Encoding.UTF8, recursive: true });
    if (!current()) throw new Error("SESSION_CHANGED");
    await Share.share({ title: "LionClubs 服務紀錄", files: [result.uri], dialogTitle: "儲存或分享服務紀錄" });
    shared = true;
  } catch { throw new Error("EXPORT_UNCONFIRMED"); }
  finally {
    if (!android || !shared) {
      await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {});
      await Filesystem.rmdir({ path: folder, directory: Directory.Cache }).catch(() => {});
    }
  }
}
