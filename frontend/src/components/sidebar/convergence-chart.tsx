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
    <div className="flex flex-col gap-[6px]">
      <div className="text-[10px] font-bold uppercase tracking-[0.9px] text-slate">
        Konvergensi (best Z per iterasi)
      </div>
      <div className="h-[140px] w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-frost)" strokeDasharray="2 4" />
            <XAxis dataKey="iteration" stroke="var(--color-slate)" fontSize={10} tickLine={false} />
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
              formatter={(value) => formatNumber(Number(value ?? 0), 0)}
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
              stroke="var(--color-midnight-ink)"
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
