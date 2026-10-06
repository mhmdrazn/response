"use client";

import { formatDuration, formatNumber } from "../../lib/format-metrics";
import { ROUTE_COLORS } from "../../lib/map-constants";
import type { OptimizationResult } from "../../types";

interface BalancePanelProps {
  result: OptimizationResult;
}

/** Plain-language reading of the Gini coefficient of pumped litres across the fleet. */
function evenness(gini: number): { label: string; cls: string } {
  if (gini < 0.3) return { label: "Merata", cls: "text-[#15803d]" };
  if (gini < 0.5) return { label: "Cukup merata", cls: "text-[#b45309]" };
  return { label: "Timpang", cls: "text-[#b91c1c]" };
}

export function BalancePanel({ result }: BalancePanelProps) {
  const b = result.balance;
  if (!b) {
    return <p className="m-0 text-[12px] font-medium text-slate">Metrik keseimbangan belum tersedia.</p>;
  }

  const verdict = evenness(b.load_gini);
  const byLoad = [...result.routes].sort((a, c) => c.pumped_l - a.pumped_l);
  const top = Math.max(1, ...byLoad.map((r) => r.pumped_l));
  const idle = b.vehicles_total - b.vehicles_used;
  const mostLoaded = byLoad[0];
  const makespanShare = mostLoaded && mostLoaded.shift_limit_s > 0
    ? (b.makespan_s / mostLoaded.shift_limit_s) * 100
    : null;

  return (
    <div className="flex flex-col gap-[16px]">
      <dl className="m-0 grid grid-cols-2 gap-[8px]">
        <Tile
          label="Rute terpanjang"
          value={formatDuration(b.makespan_s)}
          sub={`${b.makespan_vehicle_id ?? "-"}${makespanShare !== null ? ` · ${formatNumber(makespanShare, 0)}% jam kerja` : ""}`}
          hint="Makespan: kapan kru terakhir pulang."
        />
        <Tile
          label="Rata-rata rute"
          value={formatDuration(b.mean_route_s)}
          sub={`simpangan ${formatNumber(b.route_time_cv * 100, 0)}%`}
          hint="Makin kecil simpangan, makin seragam lama kerja kru."
        />
        <Tile
          label="Kendaraan aktif"
          value={`${b.vehicles_used} dari ${b.vehicles_total}`}
          sub={idle > 0 ? `${idle} menganggur` : "semua bekerja"}
        />
        <Tile
          label="Pemakaian jam kerja"
          value={`${formatNumber(b.utilization_mean_pct, 0)}%`}
          sub={`tertinggi ${formatNumber(b.utilization_max_pct, 0)}%`}
          hint="Lama rute dibanding batas jam operasional kru itu."
        />
      </dl>

      <section className="flex flex-col gap-[8px]">
        <div className="flex items-baseline justify-between gap-8">
          <h3 className="m-0 text-[10px] font-bold uppercase tracking-[0.9px] text-slate">
            Sebaran beban antar kendaraan
          </h3>
          <span className={`text-[12px] font-bold ${verdict.cls}`}>{verdict.label}</span>
        </div>
        <ul className="m-0 flex list-none flex-col gap-[5px] p-0">
          {byLoad.map((r) => (
            <li key={r.vehicle_id} className="flex items-center gap-[8px] text-[11.5px]">
              <span
                aria-hidden
                className="inline-block h-[9px] w-[9px] flex-shrink-0 rounded-full"
                style={{ background: ROUTE_COLORS[r.route_color_index % ROUTE_COLORS.length] }}
              />
              <span className="w-[58px] flex-shrink-0 truncate font-bold text-midnight-ink">
                {r.vehicle_id}
              </span>
              <span className="relative block h-[8px] flex-1 overflow-hidden rounded-full bg-frost">
                <span
                  className="block h-full rounded-full bg-steel transition-[width] duration-500 ease-out"
                  style={{ width: `${(r.pumped_l / top) * 100}%` }}
                />
              </span>
              <span className="w-[62px] flex-shrink-0 text-right font-semibold tabular-nums text-steel">
                {formatNumber(r.pumped_l)} L
              </span>
            </li>
          ))}
        </ul>
        <p className="m-0 text-[11px] font-medium leading-[1.45] text-slate">
          Rata-rata {formatNumber(b.pumped_mean_l)} L per kendaraan aktif, tertinggi{" "}
          {formatNumber(b.pumped_max_l)} L. Koefisien Gini {formatNumber(b.load_gini, 2)} (0 = sama
          rata, 1 = satu kendaraan memikul semuanya), dihitung di antara kendaraan yang bekerja.
        </p>
      </section>

      <section className="flex flex-col gap-[8px]">
        <h3 className="m-0 text-[10px] font-bold uppercase tracking-[0.9px] text-slate">
          Rute per depo
        </h3>
        <div className="overflow-hidden rounded-md border border-frost">
          <table className="w-full border-collapse text-left text-[11.5px]">
            <thead>
              <tr className="bg-mist text-[9.5px] font-bold uppercase tracking-[0.6px] text-slate">
                <th className="px-[10px] py-[7px]">Depo</th>
                <th className="px-[6px] py-[7px] text-right">Rute</th>
                <th className="px-[6px] py-[7px] text-right">Dipompa</th>
                <th className="px-[10px] py-[7px] text-right">Terlama</th>
              </tr>
            </thead>
            <tbody>
              {b.depots.map((d) => (
                <tr key={d.depot_id} className="border-t border-frost">
                  <td className="max-w-[120px] px-[10px] py-[7px]">
                    <div className="truncate font-bold text-midnight-ink" title={d.depot_name}>
                      {d.depot_name}
                    </div>
                  </td>
                  <td className="px-[6px] py-[7px] text-right font-semibold tabular-nums text-steel">
                    {d.vehicles_used}/{d.vehicles_total}
                  </td>
                  <td className="px-[6px] py-[7px] text-right font-semibold tabular-nums text-steel">
                    {formatNumber(d.pumped_l)} L
                  </td>
                  <td className="px-[10px] py-[7px] text-right font-semibold tabular-nums text-midnight-ink">
                    {d.vehicles_used > 0 ? formatDuration(d.longest_route_s) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  hint,
}: {
  label: string;
  value: string;
  sub: string;
  hint?: string;
}) {
  return (
    <div
      title={hint}
      className="flex min-w-0 flex-col gap-[2px] rounded-md border border-frost bg-pure-white px-[10px] py-[9px]"
    >
      <dt className="text-[9.5px] font-bold uppercase tracking-[0.7px] text-slate">{label}</dt>
      <dd className="m-0 truncate text-[16px] font-bold leading-[1.15] tracking-[-0.3px] tabular-nums text-midnight-ink">
        {value}
      </dd>
      <dd className="m-0 truncate text-[10.5px] font-medium text-slate">{sub}</dd>
    </div>
  );
}
