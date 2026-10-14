"use client";

import QrCode from "./QrCode";
import AccessibleDialog from "./AccessibleDialog";

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
    <AccessibleDialog open onClose={onClose} title={title} description={subtitle}>
      <div className="flex flex-col items-center">
        <div className="aspect-square w-full max-w-64 rounded-xl overflow-hidden mb-4">
          <QrCode value={value} />
        </div>
        <button
          onClick={onClose}
          className="min-h-12 w-full rounded-xl bg-lion-action text-lion-navyDeep font-semibold py-2.5 text-sm"
        >
          關閉
        </button>
      </div>
    </AccessibleDialog>
  );
}
