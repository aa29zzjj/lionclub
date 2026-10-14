"use client";

import { useRef, useState } from "react";
import AccessibleDialog from "./AccessibleDialog";
import QrCode from "./QrCode";

export default function InviteQrDialog({ value, validUntil, onClose }: { value: string; validUntil: string; onClose: () => void }) {
  const qrRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [large, setLarge] = useState(false);

  async function download() {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg || downloading) return;
    setDownloading(true);
    setNotice("");
    let objectUrl = "";
    try {
      const serialized = new XMLSerializer().serializeToString(svg);
      objectUrl = URL.createObjectURL(new Blob([serialized], { type: "image/svg+xml;charset=utf-8" }));
      const bitmap = new Image();
      await new Promise<void>((resolve, reject) => { bitmap.onload = () => resolve(); bitmap.onerror = reject; bitmap.src = objectUrl; });
      const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 1360;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no canvas");
      context.fillStyle = "#FFFFFF"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 100, 60, 1000, 1000);
      context.fillStyle = "#12224A"; context.textAlign = "center"; context.font = "bold 38px sans-serif";
      context.fillText("獅子會平台註冊邀請", 600, 1130);
      context.font = "28px sans-serif"; context.fillText(`有效至 ${new Date(validUntil).toLocaleString("zh-TW")}`, 600, 1190);
      context.fillText("平台邀請不代表正式獅子會會籍已核實", 600, 1250);
      const anchor = document.createElement("a"); anchor.href = canvas.toDataURL("image/png"); anchor.download = "lionclub-registration-qr.png"; anchor.click();
      setNotice("QR 圖片已準備下載；手機也可長按圖片或使用截圖分享。");
    } catch { setNotice("此瀏覽器無法下載圖片，請使用放大 QR 後截圖分享。"); }
    finally { if (objectUrl) URL.revokeObjectURL(objectUrl); setDownloading(false); }
  }

  return <AccessibleDialog open title="註冊邀請 QR" description={`有效至 ${new Date(validUntil).toLocaleString("zh-TW")}；只影響新註冊，不會停用既有帳號。`} onClose={onClose} fullscreen={large} busy={downloading}>
    <div ref={qrRef} className={`mx-auto aspect-square w-full rounded-xl bg-white p-2 ${large ? "max-w-[min(66dvh,900px)]" : "max-w-[300px]"}`}><QrCode value={value} /></div>
    <p className="mt-4 text-sm leading-relaxed text-lion-muted">請受邀者使用手機相機掃描；平台註冊不代表正式獅子會會籍已驗證。</p>
    <div className="mt-4 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
      <button type="button" onClick={() => setLarge((current) => !current)} className="min-h-12 rounded-xl border border-lion-border px-3 text-base">{large ? "恢復大小" : "放大／全螢幕顯示"}</button>
      <button type="button" disabled={downloading} onClick={() => void download()} className="min-h-12 rounded-xl bg-lion-action px-3 text-base font-semibold text-lion-navyDeep disabled:opacity-50">{downloading ? "準備圖片中…" : "下載 QR 圖片"}</button>
    </div>
    <button type="button" className="mt-2 min-h-12 w-full rounded-xl border border-lion-border px-3 text-base" onClick={async () => {
      try { await navigator.clipboard.writeText(value); setNotice("邀請連結已複製，可傳給受邀者。"); }
      catch { setNotice("無法複製，請下載圖片或放大 QR 給對方掃描。"); }
    }}>複製邀請連結</button>
    {notice && <p role="status" className="mt-3 text-sm leading-relaxed">{notice}</p>}
  </AccessibleDialog>;
}
