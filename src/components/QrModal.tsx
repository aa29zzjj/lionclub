"use client";

import QrCode from "./QrCode";

export default function QrModal({
  title,
  subtitle,
  value,
  onClose,
}: {
  title: string;
  subtitle?: string;
  value: string;
  onClose: () => void;
}) {
  return (
    <div
      className="modal-safe fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[320px] rounded-2xl bg-lion-card border border-white/10 p-6 flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-semibold mb-1">{title}</p>
        {subtitle && <p className="text-xs text-lion-muted mb-4 text-center">{subtitle}</p>}
        <div className="w-48 h-48 rounded-xl overflow-hidden mb-4">
          <QrCode value={value} />
        </div>
        <button
          onClick={onClose}
          className="min-h-12 w-full rounded-xl bg-lion-action text-lion-navyDeep font-semibold py-2.5 text-sm"
        >
          關閉
        </button>
      </div>
    </div>
  );
}
