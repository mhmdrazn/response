"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMeters, formatDuration, formatNumber } from "../../lib/format-metrics";
import type { ComparisonResult } from "../../types";

interface ComparisonPanelProps {
  comparison: ComparisonResult;
}

export function ComparisonPanel({ comparison }: ComparisonPanelProps) {
  const [open, setOpen] = useState(true);
  const { acs, vns } = comparison;

  const metrics: MetricRow[] = [
    {
      label: "Skor Respons (Z)",
      acs: formatNumber(acs.objective_z, 2),
      vns: formatNumber(vns.objective_z, 2),
      winner: acs.objective_z <= vns.objective_z ? "acs" : "vns",
    },
    {
      label: "Total Jarak",
      acs: formatMeters(acs.total_distance_m),
      vns: formatMeters(vns.total_distance_m),
      winner: acs.total_distance_m <= vns.total_distance_m ? "acs" : "vns",
    },
    {
      label: "Total Waktu",
      acs: formatDuration(acs.total_time_s),
      vns: formatDuration(vns.total_time_s),
      winner: acs.total_time_s <= vns.total_time_s ? "acs" : "vns",
    },
    {
      label: "Waktu Komputasi",
      acs: `${acs.computation_time_s.toFixed(1)}s`,
      vns: `${vns.computation_time_s.toFixed(1)}s`,
      winner: acs.computation_time_s <= vns.computation_time_s ? "acs" : "vns",
    },
    {
      label: "Kendaraan Aktif",
      acs: String(acs.n_vehicles),
      vns: String(vns.n_vehicles),
      winner: acs.n_vehicles <= vns.n_vehicles ? "acs" : "vns",
    },
    {
      label: "Kunjungan IF",
      acs: String(acs.total_if_visits),
      vns: String(vns.total_if_visits),
      winner: acs.total_if_visits <= vns.total_if_visits ? "acs" : "vns",
    },
  ];

  const maxLen = Math.max(acs.convergence.length, vns.convergence.length);
  const chartData = Array.from({ length: maxLen }, (_, i) => ({
    iteration: i + 1,
    acs: i < acs.convergence.length ? acs.convergence[i].best_z : null,
    vns: i < vns.convergence.length ? vns.convergence[i].best_z : null,
  }));

  const colHeaderCls =
    "border-b border-frost px-[6px] py-[4px] text-right text-[9px] font-bold uppercase tracking-[0.5px] text-slate";
  const labelCellCls = "border-b border-mist px-[6px] py-[4px] font-medium text-slate";
  const valueCellCls = (isWinner: boolean) =>
    `border-b border-mist px-[6px] py-[4px] text-right tabular-nums ${
      isWinner ? "font-bold text-midnight-ink" : "font-normal text-steel"
    }`;

  return (
    <div className="pointer-events-auto flex flex-col rounded-lg border border-frost bg-pure-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="font-manrope flex w-full cursor-pointer items-center gap-8 border-0 bg-transparent px-[14px] py-12 text-left"
      >
        <span className="flex-1 text-[10px] font-bold uppercase tracking-[0.9px] text-slate">
          Perbandingan ACS vs VNS
        </span>
        <ChevronDown
          size={14}
          color="var(--color-slate)"
          className={`transition-transform duration-[220ms] ${open ? "rotate-0" : "-rotate-90"}`}
        />
      </button>

      <div
        className={`flex flex-col gap-12 overflow-hidden transition-[max-height,opacity,padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          open
            ? "pointer-events-auto max-h-[min(560px,65vh)] px-[14px] pb-[14px] opacity-100"
            : "pointer-events-none max-h-0 px-[14px] py-0 opacity-0"
        }`}
      >
        {/* Metrics table */}
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="border-b border-frost px-[6px] py-[4px] text-left text-[9px] font-bold uppercase tracking-[0.5px] text-slate">
                Metrik
              </th>
              <th className={colHeaderCls}>ACS</th>
              <th className={colHeaderCls}>VNS</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.label}>
                <td className={labelCellCls}>{m.label}</td>
                <td className={valueCellCls(m.winner === "acs")}>{m.acs}</td>
                <td className={valueCellCls(m.winner === "vns")}>{m.vns}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Convergence overlay chart */}
        <div className="text-[10px] font-bold uppercase tracking-[0.9px] text-slate">
          Konvergensi
        </div>
        <div className="h-[160px] w-full">
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-frost)" strokeDasharray="2 4" />
              <XAxis
                dataKey="iteration"
                stroke="var(--color-slate)"
                fontSize={10}
                tickLine={false}
              />
              <YAxis
                stroke="var(--color-slate)"
                fontSize={10}
                tickLine={false}
                width={56}
                domain={[
                  (min: number) => Math.floor(min * 0.98),
                  (max: number) => Math.ceil(max * 1.02),
                ]}
                allowDecimals={false}
                tickFormatter={(v: number) => formatNumber(v, 0)}
              />
              <Tooltip
                contentStyle={{
                  border: "1px solid var(--color-frost)",
                  borderRadius: "var(--radius-md)",
                  boxShadow: "none",
                  fontFamily: "var(--font-manrope)",
                  fontSize: 12,
                }}
                formatter={(value) => formatNumber(Number(value ?? 0), 2)}
                labelFormatter={(l) => `Iterasi ${l}`}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
              <Line
                type="monotone"
                dataKey="acs"
                stroke="var(--color-route-0)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                name="ACS"
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="vns"
                stroke="var(--color-route-7)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                name="VNS"
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Delta summary */}
        <DeltaSummary acs={acs.objective_z} vns={vns.objective_z} />
      </div>
    </div>
  );
}

interface MetricRow {
  label: string;
  acs: string;
  vns: string;
  winner: "acs" | "vns";
}

function DeltaSummary({ acs, vns }: { acs: number; vns: number }) {
  const diff = vns - acs;
  const pct = vns > 0 ? (diff / vns) * 100 : 0;
  const acsWins = acs <= vns;

  return (
    <div className="rounded-md border border-frost bg-mist px-[10px] py-8 text-[11px] font-medium leading-[1.5] text-steel">
      {acsWins ? (
        <>
          <strong className="text-midnight-ink">ACS</strong> menghasilkan Z lebih baik sebesar{" "}
          <strong className="text-midnight-ink">{formatNumber(Math.abs(diff), 2)}</strong> (
          {Math.abs(pct).toFixed(1)}% lebih rendah)
        </>
      ) : (
        <>
          <strong className="text-midnight-ink">VNS</strong> menghasilkan Z lebih baik sebesar{" "}
          <strong className="text-midnight-ink">{formatNumber(Math.abs(diff), 2)}</strong> (
          {Math.abs(pct).toFixed(1)}% lebih rendah)
        </>
      )}
    </div>
  );
}
