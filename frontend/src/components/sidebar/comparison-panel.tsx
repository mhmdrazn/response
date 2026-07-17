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

  const maxLen = Math.max(
    acs.convergence.length,
    vns.convergence.length,
  );
  const chartData = Array.from({ length: maxLen }, (_, i) => ({
    iteration: i + 1,
    acs: i < acs.convergence.length ? acs.convergence[i].best_z : null,
    vns: i < vns.convergence.length ? vns.convergence[i].best_z : null,
  }));

  return (
    <div
      style={{
        background: "var(--color-pure-white)",
        border: "1px solid var(--color-frost)",
        borderRadius: "var(--radius-lg)",
        display: "flex",
        flexDirection: "column",
        pointerEvents: "auto",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 14px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "var(--font-manrope)",
          width: "100%",
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.9px",
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-slate)",
          }}
        >
          Perbandingan ACS vs VNS
        </span>
        <ChevronDown
          size={14}
          color="var(--color-slate)"
          style={{
            transition: "transform 0.22s ease",
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
          }}
        />
      </button>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          maxHeight: open ? "min(560px, 65vh)" : 0,
          padding: open ? "0 14px 14px" : "0 14px",
          opacity: open ? 1 : 0,
          overflow: "hidden",
          transition:
            "max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, padding 0.28s ease",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {/* Metrics table */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  padding: "4px 6px",
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  fontWeight: "var(--font-weight-bold)",
                  color: "var(--color-slate)",
                  borderBottom: "1px solid var(--color-frost)",
                }}
              >
                Metrik
              </th>
              <th style={colHeaderStyle}>ACS</th>
              <th style={colHeaderStyle}>VNS</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.label}>
                <td style={labelCellStyle}>{m.label}</td>
                <td style={valueCellStyle(m.winner === "acs")}>{m.acs}</td>
                <td style={valueCellStyle(m.winner === "vns")}>{m.vns}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Convergence overlay chart */}
        <div
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.9px",
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-slate)",
          }}
        >
          Konvergensi
        </div>
        <div style={{ width: "100%", height: 160 }}>
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
                width={44}
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
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
              />
              <Line
                type="monotone"
                dataKey="acs"
                stroke="var(--color-midnight-ink)"
                strokeWidth={2}
                dot={false}
                name="ACS"
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="vns"
                stroke="var(--color-steel)"
                strokeWidth={2}
                dot={false}
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

const colHeaderStyle: React.CSSProperties = {
  textAlign: "right",
  padding: "4px 6px",
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  fontWeight: "var(--font-weight-bold)",
  color: "var(--color-slate)",
  borderBottom: "1px solid var(--color-frost)",
};

const labelCellStyle: React.CSSProperties = {
  padding: "4px 6px",
  color: "var(--color-slate)",
  fontWeight: "var(--font-weight-medium)",
  borderBottom: "1px solid var(--color-mist)",
};

function valueCellStyle(isWinner: boolean): React.CSSProperties {
  return {
    textAlign: "right",
    padding: "4px 6px",
    fontVariantNumeric: "tabular-nums",
    fontWeight: isWinner ? "var(--font-weight-bold)" : "var(--font-weight-regular)",
    color: isWinner ? "var(--color-midnight-ink)" : "var(--color-steel)",
    borderBottom: "1px solid var(--color-mist)",
  };
}

function DeltaSummary({ acs, vns }: { acs: number; vns: number }) {
  const diff = vns - acs;
  const pct = vns > 0 ? (diff / vns) * 100 : 0;
  const acsWins = acs <= vns;

  return (
    <div
      style={{
        padding: "8px 10px",
        background: "var(--color-mist)",
        border: "1px solid var(--color-frost)",
        borderRadius: "var(--radius-md)",
        fontSize: 11,
        color: "var(--color-steel)",
        fontWeight: "var(--font-weight-medium)",
        lineHeight: 1.5,
      }}
    >
      {acsWins ? (
        <>
          <strong style={{ color: "var(--color-midnight-ink)" }}>ACS</strong>{" "}
          menghasilkan Z lebih baik sebesar{" "}
          <strong style={{ color: "var(--color-midnight-ink)" }}>
            {formatNumber(Math.abs(diff), 2)}
          </strong>{" "}
          ({Math.abs(pct).toFixed(1)}% lebih rendah)
        </>
      ) : (
        <>
          <strong style={{ color: "var(--color-midnight-ink)" }}>VNS</strong>{" "}
          menghasilkan Z lebih baik sebesar{" "}
          <strong style={{ color: "var(--color-midnight-ink)" }}>
            {formatNumber(Math.abs(diff), 2)}
          </strong>{" "}
          ({Math.abs(pct).toFixed(1)}% lebih rendah)
        </>
      )}
    </div>
  );
}
