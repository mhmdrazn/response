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
  const confirmBg = isDanger ? "var(--color-indigo-ink)" : "var(--color-midnight-ink)";
  const confirmHover = isDanger ? "var(--color-indigo-hover)" : "var(--color-deep-violet)";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 3000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(6,27,49,0.45)",
        backdropFilter: "blur(4px)",
        fontFamily: "var(--font-manrope)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-pure-white)",
          border: "1px solid var(--color-frost)",
          borderRadius: "var(--radius-lg)",
          width: "min(400px, calc(100vw - 32px))",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          {isDanger ? (
            <div
              style={{
                flexShrink: 0,
                width: 36,
                height: 36,
                borderRadius: "var(--radius-md)",
                background: "var(--color-mist)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-indigo-ink)",
              }}
            >
              <AlertTriangle size={18} strokeWidth={2.2} />
            </div>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <h2
              id="confirm-dialog-title"
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: "var(--font-weight-bold)",
                letterSpacing: "-0.15px",
                color: "var(--color-midnight-ink)",
                lineHeight: 1.35,
              }}
            >
              {title}
            </h2>
            {description ? (
              <p
                style={{
                  margin: 0,
                  fontSize: 12.5,
                  color: "var(--color-slate)",
                  lineHeight: 1.5,
                  fontWeight: "var(--font-weight-medium)",
                }}
              >
                {description}
              </p>
            ) : null}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 2,
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "8px 14px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-frost)",
              background: "var(--color-pure-white)",
              color: "var(--color-midnight-ink)",
              fontSize: 12.5,
              fontWeight: "var(--font-weight-semibold)",
              cursor: "pointer",
              fontFamily: "var(--font-manrope)",
              transition: "background 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-mist)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-pure-white)")}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            style={{
              padding: "8px 14px",
              borderRadius: "var(--radius-md)",
              border: "none",
              background: confirmBg,
              color: "var(--color-pure-white)",
              fontSize: 12.5,
              fontWeight: "var(--font-weight-bold)",
              cursor: "pointer",
              fontFamily: "var(--font-manrope)",
              transition: "background 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = confirmHover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = confirmBg)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
