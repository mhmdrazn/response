"use client";

import { Fragment, useEffect, useRef } from "react";

import { formatDuration, formatNumber } from "../../lib/format-metrics";
import type { RouteCycles } from "../../lib/route-cycles";
import { routePhase, stopTimings, type RoutePhase } from "../../lib/route-schedule";
import { useSimTime } from "../../lib/sim-clock";
import type { MapSelection, RouteOut, VisitOut } from "../../types";
import { SimProgressBar } from "./sim-progress-bar";

interface RouteTimelineProps {
  route: RouteOut;
  color: string;
  cycles: RouteCycles;
  onSelectStop: (selection: MapSelection) => void;
}

// Time offset | rail with the stop's dot | name and what happened there.
const GRID = "grid grid-cols-[44px_22px_minmax(0,1fr)] items-stretch gap-x-[8px]";
const PUMP_RATE_LPS = 2000 / 60;
const SETUP_S = 60;

/** Vertical segment of the route line, in the vehicle's colour, with an optional stop dot. */
function Rail({
  color,
  from = "top",
  to = "bottom",
  dot,
  faded = false,
}: {
  color: string;
  from?: "top" | "dot";
  to?: "bottom" | "dot";
  dot?: "filled" | "hollow" | "here";
  faded?: boolean;
}) {
  const DOT_Y = 16; // px from the row top: level with the stop name
  return (
    <span aria-hidden className="relative block min-h-[18px]">
      <span
        className="absolute left-1/2 w-[3px] -translate-x-1/2"
        style={{
          background: color,
          opacity: faded ? 0.35 : 1,
          top: from === "dot" ? DOT_Y : 0,
          bottom: to === "dot" ? `calc(100% - ${DOT_Y}px)` : 0,
        }}
      />
      {dot === "here" ? (
        <span
          className="route-timeline-here absolute left-1/2 h-[17px] w-[17px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            top: DOT_Y,
            color,
            background: color,
            border: "3px solid var(--color-pure-white)",
          }}
        />
      ) : dot ? (
        <span
          className="absolute left-1/2 h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            top: DOT_Y,
            border: `3px solid ${color}`,
            background: dot === "filled" ? color : "var(--color-pure-white)",
            opacity: faded ? 0.5 : 1,
          }}
        />
      ) : null}
    </span>
  );
}

/** What happened at a stop: litres pumped at a flood, poured out at an outlet. */
function caption(route: RouteOut, index: number): string {
  const v: VisitOut = route.visits[index];
  if (v.node_type === "flood") return `Genangan · +${formatNumber(v.volume_pumped_l)} L dipompa`;
  if (v.node_type === "if") {
    const poured = index > 0 ? route.visits[index - 1].tank_load_after_l : route.capacity_l;
    return `Titik buang air · −${formatNumber(poured)} L`;
  }
  if (index === 0) return "Berangkat dari depo";
  return index === route.visits.length - 1 ? "Kembali ke depo" : "Depo";
}

/** The caption while the vehicle is at the stop. */
function liveCaption(route: RouteOut, index: number, t: number): string {
  const v = route.visits[index];
  if (v.node_type === "flood") {
    const arrive = stopTimings(route)[index].arrive;
    const pumped = Math.min(v.volume_pumped_l, Math.max(0, (t - arrive - SETUP_S) * PUMP_RATE_LPS));
    return t - arrive < SETUP_S
      ? "Menyiapkan pompa…"
      : `Sedang memompa · ${formatNumber(pumped)} / ${formatNumber(v.volume_pumped_l)} L`;
  }
  if (v.node_type === "if") return "Sedang membuang air…";
  return caption(route, index);
}

function clock(t: number): string {
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

/**
 * The route's stops on a line in the vehicle's colour. While the simulation runs
 * it follows the vehicle: stops behind it fade, the stop it is at is marked, and
 * on the road a badge shows where it is heading and how far along it is.
 */
export function RouteTimeline({ route, color, cycles, onSelectStop }: RouteTimelineProps) {
  const simT = useSimTime();
  const phase: RoutePhase | null = simT !== null ? routePhase(route, simT) : null;
  const timing = stopTimings(route);
  const hereRef = useRef<HTMLLIElement | null>(null);
  const hereKey =
    phase === null ? "" : phase.kind === "done" ? "done" : `${phase.kind}-${phase.index}`;

  // Keep the vehicle in view as it moves down the list.
  useEffect(() => {
    hereRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [hereKey]);

  return (
    <>
      <p className="text-slate m-0 -mt-[4px] text-[10.5px] font-medium">
        {phase === null || simT === null ? (
          "Angka di kiri: menit sejak berangkat, saat layanan di perhentian itu selesai."
        ) : (
          <>
            <span className="font-bold" style={{ color }}>
              Simulasi {clock(simT)}
            </span>{" "}
            sejak berangkat
            {phase.kind === "done" ? " · kendaraan sudah kembali ke depo" : ""}
          </>
        )}
      </p>
      <ol className="scrollbar-hidden m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
        {route.visits.map((v, i) => {
          const stop = cycles.stops[i];
          const first = i === 0;
          const last = i === route.visits.length - 1;
          const here = phase?.kind === "stop" && phase.index === i;
          const past =
            simT !== null && !here && (phase?.kind === "done" || timing[i].depart <= simT);
          const leaving = phase?.kind === "travel" && phase.index === i;
          return (
            <Fragment key={`${v.node_id}-${i}`}>
              {stop.starts ? (
                <li aria-hidden className={GRID}>
                  <span />
                  <Rail color={color} faded={past} />
                  <span className="text-slate flex items-center gap-[8px] pt-[8px] pb-[2px] text-[10px] font-bold tracking-[0.7px] uppercase">
                    {stop.final ? "Pembuangan akhir" : `Siklus ${stop.cycle} dari ${cycles.total}`}
                    <span className="bg-frost h-px flex-1" />
                  </span>
                </li>
              ) : null}
              <li ref={here ? hereRef : undefined}>
                <button
                  type="button"
                  onClick={() => onSelectStop({ kind: v.node_type, id: v.node_id })}
                  title={`Buka detail perhentian ini · ${formatDuration(v.arrival_time_s)}`}
                  className={`${GRID} w-full cursor-pointer rounded-md border-0 px-0 text-left transition-[background-color,opacity] duration-300 ${
                    here ? "" : first && simT === null ? "bg-mist" : "hover:bg-mist bg-transparent"
                  } ${past ? "opacity-55" : "opacity-100"}`}
                  style={
                    here
                      ? { background: `color-mix(in srgb, ${color} 14%, transparent)` }
                      : undefined
                  }
                >
                  <span className="text-slate self-start pt-[9px] pr-[2px] text-right text-[11px] font-bold tabular-nums">
                    {first ? "awal" : `+${formatNumber(Math.round(v.arrival_time_s / 60))}`}
                  </span>
                  <Rail
                    color={color}
                    from={first ? "dot" : "top"}
                    to={last ? "dot" : "bottom"}
                    dot={here ? "here" : v.node_type === "depot" ? "filled" : "hollow"}
                    faded={past && !leaving}
                  />
                  <span className="flex min-w-0 flex-col gap-[1px] py-[7px] pr-[8px]">
                    <span
                      className="text-midnight-ink truncate text-[12.5px] font-bold tracking-[-0.1px]"
                      title={v.node_name}
                    >
                      {v.node_name}
                    </span>
                    <span
                      className={`truncate text-[11px] ${here ? "font-bold" : "text-slate font-medium"}`}
                      style={here ? { color } : undefined}
                    >
                      {here && simT !== null ? liveCaption(route, i, simT) : caption(route, i)}
                    </span>
                    {here && v.node_type !== "depot" ? (
                      <span className="pt-[4px]">
                        <SimProgressBar
                          route={route}
                          index={i}
                          kind="service"
                          color={color}
                          label={v.node_type === "flood" ? "Progres pemompaan" : "Progres pembuangan"}
                        />
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
              {leaving && phase?.kind === "travel" ? (
                <li ref={hereRef} className={GRID} aria-live="polite">
                  <span />
                  <Rail color={color} />
                  <span className="flex min-w-0 flex-col gap-[4px] py-[6px] pr-[8px]">
                    <span className="flex min-w-0 items-center gap-[6px]">
                      <span
                        className="flex-shrink-0 rounded-full border-[1.5px] border-white px-[7px] py-px text-[10.5px] font-bold text-white"
                        style={{ background: color }}
                      >
                        {route.vehicle_id}
                      </span>
                      <span className="text-steel truncate text-[11px] font-semibold">
                        Menuju {route.visits[i + 1]?.node_name ?? "perhentian berikutnya"}
                      </span>
                    </span>
                    <SimProgressBar
                      route={route}
                      index={i}
                      kind="travel"
                      color={color}
                      label="Progres perjalanan ke perhentian berikutnya"
                    />
                  </span>
                </li>
              ) : null}
            </Fragment>
          );
        })}
      </ol>
    </>
  );
}
