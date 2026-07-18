"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Konfirmasi",
  cancelLabel = "Batal",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
      else if (e.key === "Enter") onConfirm();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onConfirm, onCancel]);

  if (!open) return null;

  const isDanger = variant === "danger";
  const confirmCls = isDanger
    ? "bg-indigo-ink hover:bg-indigo-hover"
    : "bg-midnight-ink hover:bg-deep-violet";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={onCancel}
      className="font-manrope fixed inset-0 z-[3000] flex items-center justify-center bg-[rgba(6,27,49,0.45)] backdrop-blur-[4px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-[min(400px,calc(100vw-32px))] flex-col gap-[14px] rounded-lg border border-frost bg-pure-white p-[20px]"
      >
        <div className="flex items-start gap-12">
          {isDanger ? (
            <div className="flex h-[36px] w-[36px] flex-shrink-0 items-center justify-center rounded-md bg-mist text-indigo-ink">
              <AlertTriangle size={18} strokeWidth={2.2} />
            </div>
          ) : null}
          <div className="flex flex-col gap-[4px]">
            <h2
              id="confirm-dialog-title"
              className="m-0 text-[15px] font-bold leading-[1.35] tracking-[-0.15px] text-midnight-ink"
            >
              {title}
            </h2>
            {description ? (
              <p className="m-0 text-[12.5px] font-medium leading-[1.5] text-slate">
                {description}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-[2px] flex justify-end gap-8">
          <button
            type="button"
            onClick={onCancel}
            className="font-manrope cursor-pointer rounded-md border border-frost bg-pure-white px-[14px] py-8 text-[12.5px] font-semibold text-midnight-ink transition-colors hover:bg-mist"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={`font-manrope cursor-pointer rounded-md border-0 px-[14px] py-8 text-[12.5px] font-bold text-pure-white transition-colors ${confirmCls}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
