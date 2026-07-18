"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

interface PanelOverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function PanelOverlay({ open, onClose, title, children }: PanelOverlayProps) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1100] flex flex-col justify-end">
      {/* Backdrop */}
      <div onClick={onClose} className="absolute inset-0 bg-[rgba(6,27,49,0.4)]" />

      {/* Panel */}
      <div
        className="relative flex max-h-[85vh] flex-col rounded-t-lg bg-pure-white"
        style={{ animation: "slideUp 0.25s ease-out" }}
      >
        {/* Handle + header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-frost px-16 py-12">
          <div className="text-[12px] font-bold uppercase tracking-[0.8px] text-slate">
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="flex h-32 w-32 cursor-pointer items-center justify-center rounded-md border-0 bg-mist text-slate"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex flex-col gap-12 overflow-y-auto p-16">{children}</div>
      </div>
    </div>
  );
}
