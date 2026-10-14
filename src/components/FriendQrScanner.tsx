"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import AccessibleDialog from "./AccessibleDialog";

type ScannerStatus = "starting" | "active" | "processing" | "error";

export default function FriendQrScanner({
  onScan,
  onClose,
  title = "掃描好友 QR Code",
  subtitle = "將對方的會員 QR 對準掃描框",
  continuous = false,
  resetKey = 0,
  busy = false,
  children,
}: {
  onScan: (decodedText: string) => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  continuous?: boolean;
  resetKey?: number;
  busy?: boolean;
  children?: React.ReactNode;
}) {
  const scannerElementId = `friend-qr-scanner-${useId().replace(/:/g, "")}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const handledResultRef = useRef(false);
  const pausedRef = useRef(false);
  const stoppingRef = useRef<Promise<void>>(Promise.resolve());
  const [status, setStatus] = useState<ScannerStatus>("starting");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let disposed = false;
    handledResultRef.current = false;

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
      if (continuous) {
        try { scannerRef.current?.pause(true); pausedRef.current = true; } catch { await stopScanner().catch(() => undefined); }
      } else await stopScanner().catch(() => undefined);
      if (!disposed) onScanRef.current(decodedText);
    }

    async function startCamera() {
      setStatus("starting");
      setError("");

      try {
        await stoppingRef.current;
        if (disposed) return;
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
      stoppingRef.current = stopScanner().catch(() => undefined);
    };
  }, [scannerElementId, attempt, continuous]);

  useEffect(() => {
    const scanner = scannerRef.current;
    if (!scanner || resetKey === 0) return;
    handledResultRef.current = false;
    if (pausedRef.current) {
      try { scanner.resume(); pausedRef.current = false; setStatus("active"); setError(""); }
      catch { setAttempt((value) => value + 1); }
    } else if (!scanner.isScanning) setAttempt((value) => value + 1);
  }, [resetKey]);

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
      handledResultRef.current = false;
      setStatus("error");
      setError("這張圖片中找不到 QR Code，請換一張清楚、完整的圖片再試一次。");
    }
  }

  return (
    <AccessibleDialog open onClose={onClose} title={title} description={subtitle} busy={busy}>
        <div className="relative min-h-[280px] overflow-hidden rounded-xl bg-black mb-3">
          <div
            id={scannerElementId}
            className="w-full min-h-[280px] [&_video]:min-h-[280px] [&_video]:object-cover"
          />
          {status !== "active" && (
            <div className="theme-brand-panel absolute inset-0 flex items-center justify-center bg-black/75 px-6 text-center text-sm text-lion-cream" role="status">
              {status === "starting" && "正在開啟相機…"}
              {status === "processing" && (continuous ? busy ? "正在核對報到…" : "已辨識，請查看下方結果" : "正在辨識…")}
              {status === "error" && error}
            </div>
          )}
        </div>

        {status === "error" && <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mb-3 min-h-12 w-full rounded-xl bg-lion-action px-3 text-base font-semibold text-lion-navyDeep">重新開啟相機</button>}

        <label className="mb-2 flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-white/10 py-2.5 text-sm font-medium text-lion-cream">
          從相簿選擇 QR 圖片
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="選擇 QR 圖片"
            disabled={busy || status === "processing"}
            onChange={(event) => { void handleFileChange(event.target.files?.[0]); event.target.value = ""; }}
          />
        </label>
        {children}
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="w-full rounded-xl bg-white/5 py-2.5 text-sm font-medium text-lion-cream/70"
        >
          取消
        </button>
    </AccessibleDialog>
  );
}
