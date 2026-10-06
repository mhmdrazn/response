"use client";

import { Minus, Plus, RotateCcw, Warehouse } from "lucide-react";
import { useState } from "react";

import type { FleetDefaults } from "../../lib/api";
import {
  MAX_SHIFT_MIN,
  MAX_TANK_L,
  MAX_UNITS,
  MIN_SHIFT_MIN,
  MIN_TANK_L,
  settingFor,
  summarizeFleet,
  type DepotSetting,
  type FleetProblem,
  type FleetSettings,
} from "../../lib/fleet";
import { formatNumber } from "../../lib/format-metrics";
import type { Depot } from "../../types";

interface FleetEditorProps {
  depots: Depot[];
  value: FleetSettings;
  defaults: FleetDefaults;
  problems: FleetProblem[];
  onChange: (next: FleetSettings) => void;
}

const inputCls =
  "font-manrope w-full rounded-md border border-frost bg-pure-white px-[9px] py-[6px] text-[13px] font-semibold text-midnight-ink outline-none transition-colors focus:border-steel";

function hoursText(minutes: number | null): string {
  return minutes === null ? "" : String(Math.round((minutes / 60) * 100) / 100);
}

export function FleetEditor({ depots, value, defaults, problems, onChange }: FleetEditorProps) {
  const [allHours, setAllHours] = useState("");
  const summary = summarizeFleet(value, depots, defaults);
  const defaultHours = defaults.operating_minutes / 60;

  const patchDepot = (id: string, patch: Partial<DepotSetting>) => {
    const current = settingFor(value, id, defaults);
    onChange({ ...value, depots: { ...value.depots, [id]: { ...current, ...patch } } });
  };

  const setTank = (i: 0 | 1, raw: string) => {
    const n = raw === "" ? 0 : Number(raw);
    const tanks: [number, number] = [...value.tanks];
    tanks[i] = Number.isFinite(n) ? n : 0;
    onChange({ ...value, tanks });
  };

  const applyAllHours = () => {
    const h = Number(allHours.replace(",", "."));
    if (!Number.isFinite(h) || allHours.trim() === "") return;
    const minutes = Math.round(h * 60);
    const next: FleetSettings["depots"] = {};
    for (const d of depots) {
      next[d.id] = { ...settingFor(value, d.id, defaults), minutes };
    }
    onChange({ ...value, depots: next });
  };

  const problemOf = (id: string) => problems.find((p) => p.depotId === id)?.message;
  const tankProblem = (i: 0 | 1) =>
    problems.find((p) => p.depotId === null && p.message.startsWith(`Tangki ${i === 0 ? "A" : "B"}`));

  return (
    <div className="flex flex-col">
      {/* Tank sizes --------------------------------------------------------- */}
      <section className="grid grid-cols-2 gap-12 border-b border-frost px-[18px] py-[14px]">
        {([0, 1] as const).map((i) => (
          <label key={i} className="flex flex-col gap-[5px]">
            <span className="text-[10px] font-bold uppercase tracking-[0.9px] text-slate">
              Kapasitas tangki {i === 0 ? "A" : "B"} (liter)
            </span>
            <input
              type="number"
              min={MIN_TANK_L}
              max={MAX_TANK_L}
              step={500}
              value={value.tanks[i] || ""}
              onChange={(e) => setTank(i, e.currentTarget.value)}
              className={`${inputCls} ${tankProblem(i) ? "border-indigo-ink" : ""}`}
            />
            <span className="text-[11px] font-medium text-slate">
              {tankProblem(i)?.message ?? `Bawaan ${formatNumber(defaults.capacities_l[i] ?? 0)} L`}
            </span>
          </label>
        ))}
      </section>

      {/* Per-depot units and shift ------------------------------------------ */}
      <section className="flex flex-col gap-[10px] px-[18px] py-[14px]">
        <div className="flex flex-wrap items-end justify-between gap-12">
          <div className="min-w-0">
            <h3 className="m-0 text-[10px] font-bold uppercase tracking-[0.9px] text-slate">
              Unit dan jam operasional per depo
            </h3>
            <p className="m-0 mt-[3px] text-[11.5px] font-medium leading-[1.4] text-slate">
              Jam operasional adalah lama maksimum satu kru bertugas dalam satu rute. Kosongkan
              untuk memakai bawaan ({formatNumber(defaultHours, 1)} jam).
            </p>
          </div>
          <div className="flex items-center gap-[6px]">
            <input
              type="number"
              min={MIN_SHIFT_MIN / 60}
              max={MAX_SHIFT_MIN / 60}
              step={0.25}
              placeholder="jam"
              aria-label="Jam operasional untuk semua depo"
              value={allHours}
              onChange={(e) => setAllHours(e.currentTarget.value)}
              className={`${inputCls} !w-[72px]`}
            />
            <button
              type="button"
              onClick={applyAllHours}
              disabled={allHours.trim() === ""}
              className="cursor-pointer whitespace-nowrap rounded-md border border-frost bg-pure-white px-[10px] py-[6px] text-[11.5px] font-bold text-steel transition-colors hover:bg-mist disabled:cursor-not-allowed disabled:opacity-50"
            >
              Terapkan ke semua
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border border-frost">
          <table className="w-full min-w-[470px] border-collapse text-left">
            <thead>
              <tr className="bg-mist text-[10px] font-bold uppercase tracking-[0.7px] text-slate">
                <th className="px-[12px] py-[8px]">Depo</th>
                <th className="w-[104px] px-[8px] py-[8px] text-center">
                  Unit A · {formatNumber(value.tanks[0])} L
                </th>
                <th className="w-[104px] px-[8px] py-[8px] text-center">
                  Unit B · {formatNumber(value.tanks[1])} L
                </th>
                <th className="w-[112px] px-[8px] py-[8px] text-center">Jam operasional</th>
                <th className="w-[36px] px-[4px] py-[8px]" aria-label="Atur ulang" />
              </tr>
            </thead>
            <tbody>
              {depots.map((d) => {
                const s = settingFor(value, d.id, defaults);
                const changed =
                  s.units[0] !== defaults.units_per_capacity ||
                  s.units[1] !== defaults.units_per_capacity ||
                  s.minutes !== null;
                const issue = problemOf(d.id);
                return (
                  <tr
                    key={d.id}
                    className={`border-t border-frost transition-colors ${
                      changed ? "bg-periwinkle-wash" : "bg-pure-white"
                    }`}
                  >
                    <td className="px-[12px] py-[7px]">
                      <div className="flex items-center gap-[8px]">
                        <Warehouse size={14} strokeWidth={2} color="var(--color-depot-accent)" aria-hidden />
                        <div className="min-w-0">
                          <div
                            className="max-w-[120px] truncate text-[12.5px] sm:max-w-[230px] font-bold text-midnight-ink"
                            title={d.name ?? d.id}
                          >
                            {d.name ?? d.id}
                          </div>
                          {issue ? (
                            <div className="text-[11px] font-semibold text-indigo-ink">{issue}</div>
                          ) : s.units[0] + s.units[1] === 0 ? (
                            <div className="text-[11px] font-medium text-slate">Tidak beroperasi</div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    {([0, 1] as const).map((i) => (
                      <td key={i} className="px-[8px] py-[7px]">
                        <Stepper
                          label={`Unit ${i === 0 ? "A" : "B"} ${d.name ?? d.id}`}
                          value={s.units[i]}
                          onChange={(n) => {
                            const units: [number, number] = [...s.units];
                            units[i] = n;
                            patchDepot(d.id, { units });
                          }}
                        />
                      </td>
                    ))}
                    <td className="px-[8px] py-[7px]">
                      <input
                        type="number"
                        min={MIN_SHIFT_MIN / 60}
                        max={MAX_SHIFT_MIN / 60}
                        step={0.25}
                        placeholder={formatNumber(defaultHours, 1)}
                        aria-label={`Jam operasional ${d.name ?? d.id}`}
                        value={hoursText(s.minutes)}
                        onChange={(e) => {
                          const raw = e.currentTarget.value;
                          patchDepot(d.id, {
                            minutes: raw === "" ? null : Math.round(Number(raw) * 60),
                          });
                        }}
                        className={`${inputCls} text-center ${issue ? "border-indigo-ink" : ""}`}
                      />
                    </td>
                    <td className="px-[4px] py-[7px] text-center">
                      {changed ? (
                        <button
                          type="button"
                          title="Kembalikan bawaan"
                          aria-label={`Kembalikan bawaan ${d.name ?? d.id}`}
                          onClick={() => {
                            const rest = { ...value.depots };
                            delete rest[d.id];
                            onChange({ ...value, depots: rest });
                          }}
                          className="inline-flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-slate transition-colors hover:bg-frost"
                        >
                          <RotateCcw size={13} strokeWidth={2.2} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="m-0 text-[12px] font-semibold text-steel">
          {formatNumber(summary.units)} unit di {formatNumber(summary.activeDepots)} depo ·{" "}
          {formatNumber(summary.loadL)} L terangkut dalam satu muatan serentak
        </p>
      </section>
    </div>
  );
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  const btn =
    "inline-flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-md border border-frost bg-pure-white text-steel transition-colors enabled:cursor-pointer enabled:hover:bg-mist disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div role="group" aria-label={label} className="flex items-center justify-center gap-[6px]">
      <button
        type="button"
        className={btn}
        aria-label="Kurangi"
        disabled={value <= 0}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={12} strokeWidth={2.4} />
      </button>
      <span className="w-[18px] text-center text-[13px] font-bold tabular-nums text-midnight-ink">
        {value}
      </span>
      <button
        type="button"
        className={btn}
        aria-label="Tambah"
        disabled={value >= MAX_UNITS}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={12} strokeWidth={2.4} />
      </button>
    </div>
  );
}
