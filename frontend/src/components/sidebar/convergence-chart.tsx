"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatNumber } from "../../lib/format-metrics";
import type { ConvergencePoint } from "../../types";

interface ConvergenceChartProps {
  data: ConvergencePoint[];
}

export function ConvergenceChart({ data }: ConvergenceChartProps) {
  if (!data.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.9px",
          fontWeight: "var(--font-weight-bold)",
          color: "var(--color-slate)",
        }}
      >
        Konvergensi (best Z per iterasi)
      </div>
      <div style={{ width: "100%", height: 140 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
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
              formatter={(value) =>
                formatNumber(Number(value ?? 0), 0)
              }
              labelFormatter={(l) => `Iterasi ${l}`}
            />
            <Line
              type="monotone"
              dataKey="iter_best_z"
              stroke="var(--color-smoke)"
              strokeWidth={1.5}
              dot={false}
              name="Iterasi"
            />
            <Line
              type="monotone"
              dataKey="best_z"
              stroke="var(--color-indigo-ink)"
              strokeWidth={2}
              dot={false}
              name="Best"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
