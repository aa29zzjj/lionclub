import type { Worker } from "tesseract.js";
import { maxBusinessCardBytes, maxBusinessCardInput } from "./next-phase-contract";

export async function prepareBusinessCard(file: File) {
  if (file.size > maxBusinessCardInput) throw new Error("請選擇 12 MB 以下的名片照片。");
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") throw new Error("請選擇 JPG、PNG 或手機照片。");
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("這張照片無法開啟，請改用 JPG 或 PNG。"));
      image.src = source;
    });
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("無法處理名片照片。");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.72, 0.52, 0.35]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= maxBusinessCardBytes) {
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(",") + 1) };
      }
    }
    throw new Error("照片無法縮到可儲存的大小，請裁切至名片範圍後再試。");
  } finally { URL.revokeObjectURL(source); }
}

export async function recognizeBusinessCard(dataUrl: string, assetPath: string) {
  const { createWorker, OEM } = await import("tesseract.js");
  const assets = new URL(assetPath, window.location.href).href.replace(/\/$/, "");
  let worker: Worker | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  try {
    return await Promise.race([
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("名片辨識逾時，可手動選擇標籤。")), 35000); }),
      new Promise<string>((resolve, reject) => {
        void createWorker(["chi_tra", "eng"], OEM.LSTM_ONLY, {
          workerPath: `${assets}/worker.min.js`, corePath: assets, langPath: assets,
          workerBlobURL: false, errorHandler: reject,
        }).then(async instance => {
          if (closed) { await instance.terminate(); return; }
          worker = instance;
          const { data } = await instance.recognize(dataUrl);
          resolve(data.text);
        }).catch(reject);
      }),
    ]);
  } finally {
    closed = true;
    clearTimeout(timeout);
    await worker?.terminate();
  }
}
