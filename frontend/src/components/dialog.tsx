"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Pinned under the scrolling body. */
  footer?: ReactNode;
  /** Max width in px; the dialog shrinks to fit narrow screens. */
  width?: number;
  children: ReactNode;
}

/** Centered sheet over a dimmed backdrop; Esc and a click outside both close it. */
export function Dialog({ open, onClose, title, subtitle, footer, width = 720, children }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className="soft-fade font-manrope fixed inset-0 z-[3000] flex items-center justify-center bg-[rgba(6,27,49,0.45)] p-12 backdrop-blur-[4px] sm:p-24"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: width }}
        className="soft-enter flex max-h-full w-full flex-col overflow-hidden rounded-lg border border-frost bg-pure-white"
      >
        <header className="flex flex-shrink-0 items-start gap-12 border-b border-frost px-[18px] py-[14px]">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[15px] font-bold leading-[1.2] tracking-[-0.15px] text-midnight-ink">
              {title}
            </h2>
            {subtitle ? (
              <p className="m-0 mt-[3px] text-[12px] font-medium leading-[1.4] text-slate">
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            title="Tutup (Esc)"
            className="inline-flex h-[28px] w-[28px] flex-shrink-0 cursor-pointer items-center justify-center rounded-md border border-frost bg-pure-white text-steel transition-colors hover:bg-mist"
          >
            <X size={14} strokeWidth={2.2} />
          </button>
        </header>

        <div className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto">{children}</div>

        {footer ? (
          <footer className="flex flex-shrink-0 flex-wrap items-center gap-8 border-t border-frost bg-mist px-[18px] py-[12px]">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

type ButtonTone = "primary" | "secondary" | "ghost";

interface DialogButtonProps {
  tone?: ButtonTone;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

const TONE: Record<ButtonTone, string> = {
  primary: "border-transparent bg-indigo-ink text-white hover:bg-indigo-hover",
  secondary: "border-frost bg-pure-white text-midnight-ink hover:bg-mist",
  ghost: "border-transparent bg-transparent text-steel hover:bg-frost",
};

export function DialogButton({ tone = "secondary", disabled, onClick, children }: DialogButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-[6px] rounded-md border px-[14px] py-[8px] text-[12.5px] font-bold tracking-[-0.1px] transition-colors ${TONE[tone]} ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
    >
      {children}
    </button>
  );
}
