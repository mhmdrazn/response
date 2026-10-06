"use client";

import { CalendarClock, CheckCircle2, Clock, FastForward, StepForward, Truck } from "lucide-react";

import { MAX_PERIODS } from "../../hooks/use-optimization";
import { formatDuration, formatNumber } from "../../lib/format-metrics";
import { buildTimeline, carryOverVolumes } from "../../lib/periods";
import type { OptimizationResult } from "../../types";

interface PeriodsPanelProps {
  periods: OptimizationResult[];
  activePeriod: number;
  onSelect: (index: number) => void;
  onNext: () => void;
  onRemaining: () => void;
  isLoading: boolean;
}

/** One hue per period, shared by its progress segment and its marker. */
const PERIOD_COLORS = ["#0891b2", "#7c3aed", "#059669", "#d97706", "#e11d48", "#0284c7"];

const colorOf = (index: number) => PERIOD_COLORS[index % PERIOD_COLORS.length];

export function PeriodsPanel({
  periods,
  activePeriod,
  onSelect,
  onNext,
  onRemaining,
  isLoading,
}: PeriodsPanelProps) {
  const rows = buildTimeline(periods);
  const last = rows[rows.length - 1];
  const original = periods[0]?.demand_total_l ?? 0;
  const done = last !== undefined && last.carriedOutL < 1;
  const atLimit = periods.length >= MAX_PERIODS;
  // A result saved before leftovers were itemised cannot seed the next period.
  const legacy =
    !done && periods.length > 0 && carryOverVolumes(periods[periods.length - 1]) === null;

  if (!last) return null;

  return (
    <div className="flex flex-col gap-[16px]">
      {/* Overall progress ------------------------------------------------------ */}
      <section className="flex flex-col gap-[10px] rounded-md border border-frost bg-pure-white p-[12px]">
        <div className="flex items-end justify-between gap-12">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.9px] text-slate">
              Kemajuan seluruh periode
            </div>
            <div className="mt-[2px] text-[11.5px] font-medium leading-[1.4] text-steel">
              {done
                ? `${formatNumber(original)} L selesai dalam ${rows.length} periode`
                : `Sisa ${formatNumber(last.carriedOutL)} L${last.openPoints > 0 ? ` di ${last.openPoints} titik` : ""}`}
            </div>
          </div>
          <div
            className={`flex-shrink-0 text-[26px] font-bold leading-none tracking-[-0.8px] tabular-nums ${
              done ? "text-[#15803d]" : "text-midnight-ink"
            }`}
          >
            {formatNumber(last.cumulativeCoveragePct, 1)}
            <span className="text-[14px] tracking-normal">%</span>
          </div>
        </div>

        <div
          className="flex h-[8px] w-full gap-[2px] overflow-hidden rounded-full bg-frost"
          role="img"
          aria-label={`${formatNumber(last.cumulativeCoveragePct, 1)} persen beban terpompa`}
        >
          {rows.map((r) => (
            <span
              key={r.index}
              title={`Periode ${r.index + 1}: ${formatNumber(r.pumpedL)} L`}
              className="h-full transition-[width] duration-500 ease-out first:rounded-l-full last:rounded-r-full"
              style={{
                width: `${original > 0 ? (r.pumpedL / original) * 100 : 0}%`,
                background: colorOf(r.index),
              }}
            />
          ))}
        </div>
      </section>

      {/* Timeline --------------------------------------------------------------- */}
      <ol className="m-0 flex list-none flex-col p-0">
        {rows.map((r, i) => {
          const active = r.index === activePeriod;
          const color = colorOf(r.index);
          const closing = r.carriedOutL < 1;
          return (
            <li key={r.index} className="relative flex gap-[12px] pb-[12px] last:pb-0">
              {i < rows.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute bottom-0 left-[12px] top-[28px] w-[2px] rounded-full bg-frost"
                />
              ) : null}

              <span
                aria-hidden
                className="relative z-[1] mt-[8px] inline-flex h-[24px] w-[24px] flex-shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold tabular-nums transition-colors duration-200"
                style={
                  active
                    ? { background: color, color: "#ffffff" }
                    : { background: `color-mix(in srgb, ${color} 14%, white)`, color }
                }
              >
                {r.index + 1}
              </span>

              <button
                type="button"
                onClick={() => onSelect(r.index)}
                aria-pressed={active}
                aria-label={`Periode ${r.index + 1}`}
                className="font-manrope flex min-w-0 flex-1 cursor-pointer flex-col gap-[10px] rounded-md border bg-pure-white px-[12px] py-[10px] text-left transition-colors duration-200 hover:bg-mist"
                style={{
                  borderColor: active ? color : "var(--color-frost)",
                  background: active ? `color-mix(in srgb, ${color} 6%, white)` : undefined,
                }}
              >
                <div className="flex items-center justify-between gap-8">
                  <span className="text-[13px] font-bold tracking-[-0.1px] text-midnight-ink">
                    Periode {r.index + 1}
                  </span>
                  <span className="inline-flex items-center gap-[4px] rounded-full bg-mist px-[8px] py-[2px] text-[10.5px] font-semibold tabular-nums text-steel">
                    <Clock size={10} strokeWidth={2.4} aria-hidden />
                    {formatDuration(r.startS)} - {formatDuration(r.endS)}
                  </span>
                </div>

                <dl className="m-0 grid grid-cols-3 divide-x divide-frost">
                  <Figure label="Masuk" value={formatNumber(r.carriedInL)} first />
                  <Figure label="Terpompa" value={formatNumber(r.pumpedL)} />
                  <Figure
                    label="Sisa"
                    value={formatNumber(r.carriedOutL)}
                    tone={closing ? "good" : "warn"}
                  />
                </dl>

                <div className="flex flex-wrap items-center gap-[6px] text-[10.5px] font-semibold text-steel">
                  <Chip>
                    <Truck size={11} strokeWidth={2.2} aria-hidden />
                    {r.vehicles} kendaraan
                  </Chip>
                  <Chip>
                    {r.completedPoints} titik tuntas
                    {r.openPoints > 0 ? `, ${r.openPoints} terbuka` : ""}
                  </Chip>
                  <Chip>Kumulatif {formatNumber(r.cumulativeCoveragePct, 1)}%</Chip>
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      {/* What to do next ----------------------------------------------------- */}
      {done ? (
        <div className="flex items-center gap-[8px] rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-[12px] py-[10px] text-[12px] font-semibold text-[#15803d]">
          <CheckCircle2 size={15} strokeWidth={2.2} className="flex-shrink-0" />
          Tidak ada sisa beban, jadi tidak perlu periode berikutnya.
        </div>
      ) : legacy ? (
        <p className="m-0 rounded-md border border-frost bg-mist px-[12px] py-[10px] text-[12px] font-semibold leading-[1.45] text-steel">
          Hasil ini disimpan sebelum perencanaan periode tersedia. Jalankan optimasi lagi untuk
          melanjutkan ke periode berikutnya.
        </p>
      ) : (
        <div className="flex flex-col gap-[8px]">
          <div className="grid grid-cols-2 gap-[6px]">
            <ActionButton
              primary
              disabled={isLoading || atLimit}
              onClick={onNext}
              Icon={StepForward}
              label="Periode berikutnya"
            />
            <ActionButton
              disabled={isLoading || atLimit}
              onClick={onRemaining}
              Icon={FastForward}
              label="Selesaikan semua"
            />
          </div>
          <p className="m-0 flex items-start gap-[6px] text-[11px] font-medium leading-[1.45] text-slate">
            <CalendarClock size={13} strokeWidth={2} className="mt-px flex-shrink-0" aria-hidden />
            {atLimit
              ? `Batas ${MAX_PERIODS} periode tercapai.`
              : `Tiap periode memakai armada penuh lagi dan anggaran komputasi yang sama. Sisa volume dibawa apa adanya (tinggi air dianggap tetap). Maksimal ${MAX_PERIODS} periode.`}
          </p>
        </div>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  tone = "plain",
  first = false,
}: {
  label: string;
  value: string;
  tone?: "plain" | "good" | "warn";
  first?: boolean;
}) {
  const color =
    tone === "good" ? "text-[#15803d]" : tone === "warn" ? "text-[#b45309]" : "text-midnight-ink";
  return (
    <div className={`min-w-0 ${first ? "pr-[10px]" : "px-[10px]"}`}>
      <dt className="text-[9.5px] font-bold uppercase tracking-[0.7px] text-slate">{label}</dt>
      <dd className={`m-0 truncate text-[14px] font-bold leading-[1.3] tabular-nums ${color}`}>
        {value}
        <span className="ml-[3px] text-[10.5px] font-semibold text-slate">L</span>
      </dd>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-[4px] rounded-md bg-mist px-[7px] py-[3px]">
      {children}
    </span>
  );
}

function ActionButton({
  Icon,
  label,
  onClick,
  disabled,
  primary = false,
}: {
  Icon: typeof StepForward;
  label: string;
  onClick: () => void;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`font-manrope inline-flex items-center justify-center gap-[6px] rounded-md border px-[10px] py-[9px] text-[12px] font-bold tracking-[-0.1px] transition-colors ${
        primary
          ? "border-transparent bg-indigo-ink text-white enabled:hover:bg-indigo-hover"
          : "border-frost bg-pure-white text-midnight-ink enabled:hover:bg-mist"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <Icon size={14} strokeWidth={2.2} />
      {label}
    </button>
  );
}
