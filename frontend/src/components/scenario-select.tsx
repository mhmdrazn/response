"use client";

import { ChevronDown, Layers } from "lucide-react";

import type { ScenarioMeta } from "../types";

interface ScenarioSelectProps {
  scenarios: ScenarioMeta[];
  value: string | undefined;
  onChange: (id: string) => void;
}

/** Compact scenario picker. Hidden when there is only one scenario. */
export function ScenarioSelect({ scenarios, value, onChange }: ScenarioSelectProps) {
  if (scenarios.length <= 1) return null;
  return (
    <label className="group relative inline-flex flex-shrink-0 items-center">
      <Layers
        size={13}
        strokeWidth={2}
        className="pointer-events-none absolute left-8 text-slate transition-colors group-focus-within:text-indigo-ink"
      />
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Pilih skenario"
        title="Pilih skenario banjir"
        className="font-manrope cursor-pointer appearance-none rounded-md border border-frost bg-pure-white py-[6px] pl-[26px] pr-[26px] text-[12px] font-bold tracking-[-0.1px] text-midnight-ink outline-none transition-colors hover:bg-mist focus:border-indigo-ink focus:bg-periwinkle-wash focus:ring-2 focus:ring-[var(--color-indigo-ink)]/15"
      >
        {scenarios.map((sc) => (
          <option key={sc.id} value={sc.id}>
            {sc.name}
            {sc.n_points != null ? ` · ${sc.n_points} titik` : ""}
          </option>
        ))}
      </select>
      <ChevronDown
        size={13}
        strokeWidth={2}
        color="var(--color-slate)"
        className="pointer-events-none absolute right-8"
      />
    </label>
  );
}
