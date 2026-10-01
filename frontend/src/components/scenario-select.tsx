"use client";

import type { ScenarioMeta } from "../types";
import { SelectMenu, type SelectOption } from "./select-menu";

interface ScenarioSelectProps {
  scenarios: ScenarioMeta[];
  value: string | undefined;
  onChange: (id: string) => void;
}

/** Flood-scenario picker. Hidden when there is only one scenario. */
export function ScenarioSelect({ scenarios, value, onChange }: ScenarioSelectProps) {
  if (scenarios.length <= 1) return null;

  const options: SelectOption[] = scenarios.map((sc) => ({
    value: sc.id,
    label: sc.name,
    hint: sc.n_points != null ? `${sc.n_points} titik` : undefined,
  }));

  return (
    <div className="flex flex-col gap-[6px]">
      <span className="text-[10px] font-bold uppercase tracking-[0.9px] text-slate">
        Skenario Banjir
      </span>
      <SelectMenu
        options={options}
        value={value}
        onChange={onChange}
        ariaLabel="Pilih skenario banjir"
      />
    </div>
  );
}
