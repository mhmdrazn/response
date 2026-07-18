"use client";

import { Clock, MapPinned, Route, TrendingDown, Truck } from "lucide-react";

import { formatDuration, formatMeters, formatNumber } from "../../lib/format-metrics";
import type { AppMode, OptimizationResult } from "../../types";

interface ResultsPanelProps {
  result: OptimizationResult;
  mode: AppMode;
}

export function ResultsPanel({ result, mode }: ResultsPanelProps) {
  return (
    <div className="flex flex-col gap-[10px]">
      <div className="grid grid-cols-2 gap-8">
        <Metric
          Icon={TrendingDown}
          label="Skor Respons"
          value={formatNumber(result.objective_z, 0)}
          hint="makin rendah makin baik"
          accent="var(--color-midnight-ink)"
        />
        <Metric
          Icon={Route}
          label="Total Jarak"
          value={formatMeters(result.total_distance_m)}
          hint={`${result.n_vehicles} kendaraan`}
          accent="#0891b2"
        />
        <Metric
          Icon={Clock}
          label="Total Waktu"
          value={formatDuration(result.total_time_s)}
          hint={`${formatDuration(result.computation_time_s)} komputasi`}
          accent="#059669"
        />
        <Metric
          Icon={MapPinned}
          label="Titik Dilayani"
          value={formatNumber(result.total_flood_visits)}
          hint={`${result.total_if_visits} titik buang air`}
          accent="#ef4444"
        />
      </div>

      {mode === "advanced" ? (
        <div className="flex gap-8 rounded-md border border-frost bg-mist px-[10px] py-8 text-[11px] font-semibold tracking-[-0.11px] text-steel">
          <Truck size={14} strokeWidth={2} />
          <span>
            Revisit: {result.total_revisits} · Algoritma: {result.algorithm.toUpperCase()}
          </span>
        </div>
      ) : null}
    </div>
  );
}

interface MetricProps {
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
  label: string;
  value: string;
  hint?: string;
  accent: string;
}

function Metric({ Icon, label, value, hint, accent }: MetricProps) {
  return (
    <div className="flex min-w-0 flex-col gap-[4px] rounded-md border border-frost bg-pure-white p-[10px]">
      <div className="flex items-center gap-[6px]">
        <Icon size={13} strokeWidth={2.2} color={accent} />
        <span className="text-[10.5px] font-bold uppercase tracking-[0.7px] text-slate">
          {label}
        </span>
      </div>
      <div className="text-[20px] font-bold tracking-[-0.4px] text-midnight-ink tabular-nums">
        {value}
      </div>
      {hint ? <div className="text-[11.5px] font-medium text-steel">{hint}</div> : null}
    </div>
  );
}
