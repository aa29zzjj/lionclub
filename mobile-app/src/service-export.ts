import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

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
  const folder = `service-exports/${Date.now()}-${crypto.randomUUID()}`;
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
