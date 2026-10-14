"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

export default function AccessibleDialog({
  open, onClose, title, description, children, busy = false, fullscreen = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  busy?: boolean;
  fullscreen?: boolean;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    const overlay = panel?.parentElement;
    const siblings = Array.from(document.body.children).filter((element) => element !== overlay && element instanceof HTMLElement) as HTMLElement[];
    const previousInert = siblings.map((element) => element.inert);
    siblings.forEach((element) => { element.inert = true; });
    const focusable = () => Array.from(panel?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])
      .filter((element) => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true");
    (panel?.querySelector<HTMLElement>("[data-dialog-initial-focus]") ?? focusable()[0] ?? panel)?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!busyRef.current) closeRef.current();
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); panel?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !panel?.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel?.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    }
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("keydown", handleKey, true);
      document.body.style.overflow = previousOverflow;
      siblings.forEach((element, index) => { element.inert = previousInert[index]; });
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="modal-safe fixed inset-0 z-50 flex items-center justify-center bg-black/75" onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} aria-busy={busy}
        className={`dialog-panel w-full border border-lion-border bg-lion-card p-5 text-lion-cream ${fullscreen ? "min-h-full max-w-none rounded-none" : "max-w-[420px] rounded-2xl"}`}>
        <div className="mb-3 flex items-start justify-between gap-3"><h2 id={titleId} className="text-lg font-semibold">{title}</h2><button type="button" disabled={busy} onClick={onClose} aria-label={`關閉${title}`} className="min-h-12 shrink-0 rounded-xl px-3 text-sm text-lion-muted disabled:opacity-50">關閉</button></div>
        {description && <p id={descriptionId} className="mb-4 text-sm leading-relaxed text-lion-muted">{description}</p>}
        {children}
      </div>
    </div>, document.body
  );
}
