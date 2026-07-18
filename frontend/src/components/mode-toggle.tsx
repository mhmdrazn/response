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
      className="inline-flex flex-shrink-0 items-center gap-[4px] rounded-lg bg-periwinkle-wash p-[6px]"
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
            className={`cursor-pointer whitespace-nowrap rounded-md border-0 font-semibold tracking-[-0.13px] transition-[background,color,box-shadow] duration-150 ${
              compact ? "px-[10px] py-[4px] text-[11px]" : "px-[14px] py-[5px] text-[13px]"
            } ${
              active
                ? "bg-active-wash text-active-ink shadow-[0_1px_2px_0_rgb(0_0_0/0.06)]"
                : "bg-transparent text-steel shadow-none"
            }`}
          >
            {compact ? opt.short : opt.label}
          </button>
        );
      })}
    </div>
  );
}
