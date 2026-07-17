"use client";

import type { AppMode } from "../types";

interface ModeToggleProps {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
  compact?: boolean;
}

const OPTIONS: { id: AppMode; label: string; short: string; desc: string }[] = [
  { id: "simple", label: "Sederhana", short: "Simple", desc: "Rute + severity, cepat" },
  { id: "advanced", label: "Analitik", short: "Analitik", desc: "Konvergensi & analisis" },
];

export function ModeToggle({ mode, onChange, compact = false }: ModeToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Mode tampilan"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: 6,
        background: "var(--color-periwinkle-wash)",
        borderRadius: "var(--radius-lg)",
        flexShrink: 0,
      }}
    >
      {OPTIONS.map((opt) => {
        const active = mode === opt.id;
        return (
          <button
            key={opt.id}
            role="radio"
            aria-checked={active}
            type="button"
            onClick={() => onChange(opt.id)}
            title={opt.desc}
            style={{
              padding: compact ? "4px 10px" : "5px 14px",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              fontSize: compact ? 11 : 13,
              fontWeight: "var(--font-weight-semibold)",
              letterSpacing: "-0.13px",
              background: active
                ? "var(--color-active-wash)"
                : "transparent",
              color: active
                ? "var(--color-active-ink)"
                : "var(--color-steel)",
              border: "none",
              boxShadow: active ? "0 1px 2px 0 rgb(0 0 0 / 0.06)" : "none",
              transition: "background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease",
              whiteSpace: "nowrap",
            }}
          >
            {compact ? opt.short : opt.label}
          </button>
        );
      })}
    </div>
  );
}
