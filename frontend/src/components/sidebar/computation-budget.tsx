"use client";

import { Timer } from "lucide-react";

export const COMPUTATION_BUDGETS = [30, 45, 60] as const;
export type ComputationBudget = (typeof COMPUTATION_BUDGETS)[number];

const LABELS: Record<ComputationBudget, { name: string; hint: string }> = {
  30: { name: "Cepat", hint: "respons singkat" },
  45: { name: "Standar", hint: "seimbang antara waktu dan hasil" },
  60: { name: "Mendalam", hint: "pencarian lebih lama" },
};

interface ComputationBudgetProps {
  value: ComputationBudget;
  onChange: (value: ComputationBudget) => void;
  disabled?: boolean;
}

/** Three-way choice of how long each algorithm may search. */
export function ComputationBudgetSelect({ value, onChange, disabled }: ComputationBudgetProps) {
  const index = COMPUTATION_BUDGETS.indexOf(value);
  const count = COMPUTATION_BUDGETS.length;

  return (
    <section aria-label="Anggaran komputasi" className="flex flex-col gap-8">
      <div className="flex items-center gap-[6px]">
        <Timer size={12} strokeWidth={2.2} color="var(--color-slate)" aria-hidden />
        <span className="text-[10px] font-bold uppercase tracking-normal text-slate">
          Anggaran Komputasi
        </span>
        <span className="ml-auto text-[10px] font-medium text-slate">per algoritma</span>
      </div>

      <div
        role="radiogroup"
        aria-label="Batas waktu komputasi"
        className="relative grid grid-cols-3 rounded-lg bg-periwinkle-wash p-[4px]"
      >
        {/* The thumb slides under whichever option is picked. */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-[4px] bottom-[4px] left-[4px] rounded-md border border-frost bg-pure-white transition-transform duration-[260ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{
            width: `calc((100% - 8px) / ${count})`,
            transform: `translateX(${index * 100}%)`,
          }}
        />
        {COMPUTATION_BUDGETS.map((s) => {
          const selected = s === value;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(s)}
              className={`font-manrope relative z-[1] flex flex-col items-center gap-[1px] rounded-md border-0 bg-transparent px-[6px] py-[7px] text-center transition-colors ${
                disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
              }`}
            >
              <span
                className={`text-[15px] leading-none tracking-[-0.3px] tabular-nums transition-colors ${
                  selected ? "font-bold text-midnight-ink" : "font-semibold text-steel"
                }`}
              >
                {s}
                <span className="ml-[3px] text-[10.5px] font-semibold">dtk</span>
              </span>
              <span
                className={`text-[11px] leading-[1.3] transition-colors ${
                  selected ? "font-bold text-midnight-ink" : "font-medium text-slate"
                }`}
              >
                {LABELS[s].name}
              </span>
            </button>
          );
        })}
      </div>

      <p className="m-0 text-[11px] font-medium leading-[1.4] text-slate">
        {LABELS[value].name}: {LABELS[value].hint}.
      </p>
    </section>
  );
}
