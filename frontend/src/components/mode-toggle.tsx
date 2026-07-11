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
        gap: 2,
        padding: 3,
        background: "var(--color-mist)",
        border: "1px solid var(--color-frost)",
        borderRadius: 999,
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
              padding: compact ? "5px 10px" : "6px 14px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              fontSize: compact ? 11 : 13,
              fontWeight: "var(--font-weight-semibold)",
              letterSpacing: "-0.13px",
              background: active
                ? "var(--color-indigo-ink)"
                : "transparent",
              color: active ? "#ffffff" : "var(--color-steel)",
              transition: "background 0.15s ease, color 0.15s ease",
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
