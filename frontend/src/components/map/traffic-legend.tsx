"use client";

import { TRAFFIC_LEGEND } from "../../lib/google-traffic";
import type { TrafficStatusState } from "./traffic-layer";

interface TrafficLegendProps {
  status: TrafficStatusState;
}

function hhmm(d: Date): string {
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Key to the traffic colours, with the Google mark and credit their terms ask for
 * wherever their traffic tiles are shown.
 */
export function TrafficLegend({ status }: TrafficLegendProps) {
  return (
    <div className="border-frost bg-pure-white pointer-events-auto flex max-w-[280px] flex-col gap-[7px] rounded-lg border px-[12px] py-[9px]">
      <div className="flex items-center justify-between gap-12">
        <span className="text-midnight-ink text-[11.5px] font-bold">Lalu lintas langsung</span>
        <span className="text-slate text-[10.5px] font-medium tabular-nums">
          {status.kind === "ready"
            ? `diperbarui ${hhmm(status.updatedAt)}`
            : status.kind === "loading"
              ? "memuat…"
              : ""}
        </span>
      </div>
      {status.kind === "error" ? (
        <p className="text-indigo-ink m-0 text-[11px] leading-[1.4] font-semibold">
          {status.message}
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
      <div className="flex items-center gap-[6px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- Google's own mark, as their terms require */}
        <img
          src="https://maps.gstatic.com/mapfiles/api-3/images/google4.png"
          alt="Google"
          className="h-[13px] w-auto"
        />
        <span className="text-slate text-[10px] font-medium">Data lalu lintas © Google</span>
      </div>
    </div>
  );
}
