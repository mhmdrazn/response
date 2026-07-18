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
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "8px 10px",
            background: "var(--color-mist)",
            border: "1px solid var(--color-frost)",
            borderRadius: "var(--radius-md)",
            fontSize: 11,
            color: "var(--color-steel)",
            fontWeight: "var(--font-weight-semibold)",
            letterSpacing: "-0.11px",
          }}
        >
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
    <div
      style={{
        padding: 10,
        border: "1px solid var(--color-frost)",
        borderRadius: "var(--radius-md)",
        background: "var(--color-pure-white)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Icon size={13} strokeWidth={2.2} color={accent} />
        <span
          style={{
            fontSize: 10.5,
            textTransform: "uppercase",
            letterSpacing: "0.7px",
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-slate)",
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: "var(--font-weight-bold)",
          color: "var(--color-midnight-ink)",
          letterSpacing: "-0.4px",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {hint ? (
        <div
          style={{
            fontSize: 11.5,
            color: "var(--color-steel)",
            fontWeight: "var(--font-weight-medium)",
          }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}
