"use client";

import { Lock } from "lucide-react";

import { formatNumber } from "../../lib/format-metrics";
import {
  PRIORITY_CRITERIA,
  PRIORITY_PRESETS,
  toShares,
  type PriorityState,
  type PriorityWeights,
} from "../../lib/priority";

interface PriorityEditorProps {
  value: PriorityState;
  /** Shares (0-1) of the default AHP + entropy mix, for reference; null while loading. */
  defaultShares: number[] | null;
  onChange: (next: PriorityState) => void;
}

const BAR_COLORS = ["#0891b2", "#7c3aed", "#059669"];

export function PriorityEditor({ value, defaultShares, onChange }: PriorityEditorProps) {
  const custom = value.mode === "custom";
  const shares = custom ? toShares(value.weights) : (defaultShares ?? []).map((s) => s * 100);

  const setWeight = (i: number, w: number) => {
    const weights: PriorityWeights = [...value.weights];
    weights[i] = w;
    onChange({ mode: "custom", weights });
  };

  /** Switching to custom starts from what the default mix currently is. */
  const chooseMode = (mode: PriorityState["mode"]) => {
    if (mode === value.mode) return;
    if (mode === "custom" && defaultShares) {
      const seeded = defaultShares.map((s) => Math.round(s * 100)) as PriorityWeights;
      onChange({ mode, weights: seeded.some((w) => w > 0) ? seeded : value.weights });
    } else {
      onChange({ ...value, mode });
    }
  };

  return (
    <div className="flex flex-col gap-[16px] px-[18px] py-[14px]">
      <div>
        <h3 className="m-0 text-[10px] font-bold uppercase tracking-[0.9px] text-slate">
          Bobot tingkat keparahan
        </h3>
        <p className="m-0 mt-[3px] text-[12px] font-medium leading-[1.45] text-slate">
          Tingkat keparahan (SI) menentukan titik mana yang harus dijangkau lebih dulu. Bobot di sini
          mengubah SI semua titik, warna di peta, dan urutan prioritas yang dipakai algoritma saat
          optimasi dijalankan lagi.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Sumber bobot"
        className="grid grid-cols-2 gap-[4px] rounded-lg bg-periwinkle-wash p-[4px]"
      >
        {(
          [
            ["default", "Bawaan (AHP + Entropy)"],
            ["custom", "Kustom"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value.mode === id}
            onClick={() => chooseMode(id)}
            className={`cursor-pointer rounded-md border px-[10px] py-[7px] text-[12.5px] transition-colors ${
              value.mode === id
                ? "border-frost bg-pure-white font-bold text-midnight-ink"
                : "border-transparent bg-transparent font-semibold text-steel"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="m-0 flex list-none flex-col gap-[14px] p-0">
        {PRIORITY_CRITERIA.map((c, i) => {
          const share = shares[i] ?? 0;
          return (
            <li key={c.id} className="flex flex-col gap-[6px]">
              <div className="flex items-baseline justify-between gap-12">
                <label
                  htmlFor={`priority-${c.id}`}
                  className="text-[13px] font-bold tracking-[-0.1px] text-midnight-ink"
                >
                  {c.label}
                </label>
                <span className="text-[14px] font-bold tabular-nums text-midnight-ink">
                  {formatNumber(share, 0)}%
                </span>
              </div>
              {custom ? (
                <input
                  id={`priority-${c.id}`}
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={value.weights[i]}
                  onChange={(e) => setWeight(i, Number(e.currentTarget.value))}
                  style={{ accentColor: BAR_COLORS[i] }}
                  className="h-[18px] w-full cursor-pointer"
                />
              ) : (
                <div className="h-[6px] w-full overflow-hidden rounded-full bg-frost">
                  <div
                    className="h-full rounded-full transition-[width] duration-300 ease-out"
                    style={{ width: `${share}%`, background: BAR_COLORS[i] }}
                  />
                </div>
              )}
              <span className="text-[11.5px] font-medium text-slate">{c.hint}</span>
            </li>
          );
        })}

        <li className="flex items-start gap-[10px] rounded-md border border-dashed border-frost bg-mist px-[12px] py-[10px]">
          <Lock size={14} strokeWidth={2} color="var(--color-smoke)" className="mt-[2px] flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-[12.5px] font-bold text-steel">Penduduk terdampak</div>
            <div className="text-[11.5px] font-medium leading-[1.4] text-slate">
              Belum tersedia: data jumlah penduduk per titik belum ada di dataset, jadi belum bisa
              dijadikan faktor.
            </div>
          </div>
        </li>
      </ul>

      {custom ? (
        <div className="flex flex-col gap-[6px]">
          <span className="text-[10px] font-bold uppercase tracking-[0.9px] text-slate">
            Pengaturan cepat
          </span>
          <div className="flex flex-wrap gap-[6px]">
            {PRIORITY_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange({ mode: "custom", weights: p.weights })}
                className="cursor-pointer rounded-md border border-frost bg-pure-white px-[10px] py-[6px] text-[12px] font-semibold text-steel transition-colors hover:bg-mist"
              >
                {p.label}
              </button>
            ))}
          </div>
          {value.weights.every((w) => w === 0) ? (
            <p className="m-0 text-[12px] font-semibold text-indigo-ink">
              Setidaknya satu faktor harus punya bobot lebih dari 0.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
