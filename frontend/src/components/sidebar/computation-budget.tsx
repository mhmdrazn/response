"use client";

export const COMPUTATION_BUDGETS = [30, 45, 60] as const;
export type ComputationBudget = (typeof COMPUTATION_BUDGETS)[number];

const LABELS: Record<ComputationBudget, { name: string; hint: string }> = {
  30: { name: "Cepat", hint: "Respons singkat" },
  45: { name: "Standar", hint: "Seimbang" },
  60: { name: "Mendalam", hint: "Pencarian lebih lama" },
};

interface ComputationBudgetProps {
  value: ComputationBudget;
  onChange: (value: ComputationBudget) => void;
  disabled?: boolean;
}

/** Three-way choice of how long each algorithm may search. */
export function ComputationBudgetSelect({ value, onChange, disabled }: ComputationBudgetProps) {
  return (
    <div className="flex flex-col gap-[6px]">
      <span className="text-[10px] font-bold uppercase tracking-[0.9px] text-slate">
        Anggaran Komputasi{" "}
        <span className="font-medium normal-case tracking-normal">(batas waktu per algoritma)</span>
      </span>
      <div role="radiogroup" aria-label="Anggaran komputasi" className="grid grid-cols-3 gap-[6px]">
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
              className={`font-manrope flex flex-col items-center gap-[2px] rounded-md border px-[6px] py-[9px] text-center transition-colors ${
                selected
                  ? "border-midnight-ink bg-periwinkle-wash"
                  : "border-frost bg-pure-white hover:bg-mist"
              } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
            >
              <span className="text-[17px] font-bold leading-none tracking-[-0.3px] text-midnight-ink tabular-nums">
                {s} <span className="text-[11px] font-semibold">dtk</span>
              </span>
              <span
                className={`text-[12px] leading-[1.2] tracking-[-0.1px] ${
                  selected ? "font-bold text-midnight-ink" : "font-semibold text-steel"
                }`}
              >
                {LABELS[s].name}
              </span>
              <span className="text-[10px] font-medium leading-[1.2] text-slate">
                {LABELS[s].hint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
