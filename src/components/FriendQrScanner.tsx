"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";

type ScannerStatus = "starting" | "active" | "processing" | "error";

export default function FriendQrScanner({
  onScan,
  onClose,
}: {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}) {
  const scannerElementId = `friend-qr-scanner-${useId().replace(/:/g, "")}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const handledResultRef = useRef(false);
  const [status, setStatus] = useState<ScannerStatus>("starting");
  const [error, setError] = useState("");

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let disposed = false;

    async function stopScanner() {
      const scanner = scannerRef.current;
      if (!scanner) return;
      if (scanner.isScanning) await scanner.stop();
      scanner.clear();
    }

    async function handleDecodedText(decodedText: string) {
      if (handledResultRef.current || disposed) return;
      handledResultRef.current = true;
      setStatus("processing");
      await stopScanner().catch(() => undefined);
      if (!disposed) onScanRef.current(decodedText);
    }

    async function startCamera() {
      setStatus("starting");
      setError("");

      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (disposed) return;

        const scanner = new Html5Qrcode(scannerElementId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          useBarCodeDetectorIfSupported: true,
          verbose: false,
        });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const edge = Math.min(viewfinderWidth, viewfinderHeight, 240);
              return { width: edge, height: edge };
            },
            aspectRatio: 1,
          },
          (decodedText) => void handleDecodedText(decodedText),
          () => undefined
        );

        if (disposed) {
          await stopScanner().catch(() => undefined);
          return;
        }
        setStatus("active");
      } catch {
        if (disposed) return;
        setStatus("error");
        setError("無法開啟相機。請允許相機權限，或改用 QR 圖片辨識。");
      }
    }

    void startCamera();

    return () => {
      disposed = true;
      void stopScanner().catch(() => undefined);
    };
  }, [scannerElementId]);

  async function handleFileChange(file: File | undefined) {
    if (!file || handledResultRef.current) return;

    setStatus("processing");
    setError("");

    try {
      const scanner = scannerRef.current;
      if (!scanner) throw new Error("scanner not ready");
      if (scanner.isScanning) await scanner.stop();
      const decodedText = await scanner.scanFile(file, true);
      handledResultRef.current = true;
      onScanRef.current(decodedText);
    } catch {
      setStatus("error");
      setError("這張圖片中找不到 QR Code，請換一張清楚、完整的圖片再試一次。");
    }
  }

  return (
    <div className="modal-safe fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-5" role="dialog" aria-modal="true">
      <div className="w-full max-w-[380px] rounded-2xl bg-lion-card border border-white/10 p-5">
        <div className="mb-4 text-center">
          <p className="font-semibold mb-1">掃描好友 QR Code</p>
          <p className="text-xs text-lion-muted">將對方的會員 QR 對準掃描框</p>
        </div>

        <div className="relative min-h-[280px] overflow-hidden rounded-xl bg-black mb-3">
          <div
            id={scannerElementId}
            className="w-full min-h-[280px] [&_video]:min-h-[280px] [&_video]:object-cover"
          />
          {status !== "active" && (
            <div className="theme-brand-panel absolute inset-0 flex items-center justify-center bg-black/75 px-6 text-center text-xs text-lion-cream/70">
              {status === "starting" && "正在開啟相機…"}
              {status === "processing" && "正在辨識…"}
              {status === "error" && error}
            </div>
          )}
        </div>

        <label className="mb-2 flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-white/10 py-2.5 text-sm font-medium text-lion-cream">
          從相簿選擇 QR 圖片
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => void handleFileChange(event.target.files?.[0])}
          />
        </label>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-white/5 py-2.5 text-sm font-medium text-lion-cream/70"
        >
          取消
        </button>
      </div>
    </div>
  );
}
