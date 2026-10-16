"use client";

import { formatNumber } from "../../lib/format-metrics";
import { TRAFFIC_LEGEND, type TrafficTilesStatus } from "../../lib/tomtom-traffic";
import type { TrafficStatusState } from "./traffic-layer";

interface TrafficLegendProps {
  status: TrafficStatusState;
  usage: TrafficTilesStatus | null;
}

function hhmm(d: Date): string {
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

/** Key to the traffic colours, the TomTom credit, and how much of today's allowance is used. */
export function TrafficLegend({ status, usage }: TrafficLegendProps) {
  const limited = usage?.limited ?? false;
  return (
    <div className="border-frost bg-pure-white pointer-events-auto flex max-w-[280px] flex-col gap-[7px] rounded-lg border px-[12px] py-[9px]">
      <div className="flex items-center justify-between gap-12">
        <span className="text-midnight-ink text-[11.5px] font-bold">Lalu lintas langsung</span>
        <span className="text-slate text-[10.5px] font-medium tabular-nums">
          {limited ? "" : status.kind === "ready" ? `diperbarui ${hhmm(status.updatedAt)}` : "memuat…"}
        </span>
      </div>
      {limited ? (
        <p className="text-indigo-ink m-0 text-[11px] leading-[1.4] font-semibold">
          Batas pemakaian gratis TomTom untuk{" "}
          {usage && usage.month_count >= usage.month_limit ? "bulan" : "hari"} ini tercapai. Lapisan
          disembunyikan dan akan kembali otomatis.
        </p>
      ) : (
        <div className="flex items-center gap-[10px]">
          {TRAFFIC_LEGEND.map((t) => (
            <span key={t.label} className="flex items-center gap-[5px]">
              <span
                aria-hidden
                className="inline-block h-[4px] w-[16px] rounded-full"
                style={{ background: t.color }}
              />
              <span className="text-steel text-[10.5px] font-semibold">{t.label}</span>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-[8px]">
        <span className="text-slate text-[10px] font-medium">Data lalu lintas © TomTom</span>
        {usage ? (
          <span
            className="text-slate text-[10px] font-medium tabular-nums"
            title={`Bulan ini ${formatNumber(usage.month_count)} / ${formatNumber(usage.month_limit)} tile`}
          >
            {formatNumber(usage.day_count)} / {formatNumber(usage.day_limit)} tile hari ini
          </span>
        ) : null}
      </div>
    </div>
  );
}
