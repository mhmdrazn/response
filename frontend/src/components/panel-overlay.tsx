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
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(6, 27, 49, 0.4)",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "relative",
          background: "var(--color-pure-white)",
          borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          animation: "slideUp 0.25s ease-out",
        }}
      >
        {/* Handle + header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid var(--color-frost)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-slate)",
            }}
          >
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--color-mist)",
              border: "none",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              color: "var(--color-slate)",
            }}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Scrollable content */}
        <div
          style={{
            overflowY: "auto",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
