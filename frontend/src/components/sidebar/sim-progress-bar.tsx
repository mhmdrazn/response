"use client";

import { useEffect, useRef } from "react";

import { routePhase, stopTimings } from "../../lib/route-schedule";
import { simNow } from "../../lib/sim-clock";
import type { RouteOut } from "../../types";

interface SimProgressBarProps {
  route: RouteOut;
  /** The stop the vehicle is at ("service") or has just left ("travel"). */
  index: number;
  kind: "travel" | "service";
  color: string;
  label: string;
}

// As in route-schedule and the timeline's caption.
const PUMP_RATE_LPS = 2000 / 60;
const PUMP_SETUP_S = 60;

/** How far along the leg (or the work at the stop) the vehicle is at time `t`, 0..1. */
function progressAt(route: RouteOut, index: number, kind: SimProgressBarProps["kind"], t: number) {
  if (kind === "travel") {
    const phase = routePhase(route, t);
    if (phase.kind === "travel" && phase.index === index) return phase.frac;
    return t >= stopTimings(route)[index].depart ? 1 : 0;
  }
  const { arrive, depart } = stopTimings(route)[index];
  const visit = route.visits[index];
  // At a flood the bar is the water pumped so far, after the pump is set up, so it
  // matches the litres in the caption beside it.
  const start = visit.node_type === "flood" ? arrive + PUMP_SETUP_S : arrive;
  const end = visit.node_type === "flood" ? start + visit.volume_pumped_l / PUMP_RATE_LPS : depart;
  if (end <= start) return t >= start ? 1 : 0;
  return Math.min(1, Math.max(0, (t - start) / (end - start)));
}

/**
 * A thin bar in the vehicle's colour. It reads the simulation clock on every
 * frame and moves the fill directly, so it glides instead of stepping with the
 * timeline's few updates a second, and costs no React render per frame.
 */
export function SimProgressBar({ route, index, kind, color, label }: SimProgressBarProps) {
  const fillRef = useRef<HTMLSpanElement | null>(null);
  const headRef = useRef<HTMLSpanElement | null>(null);
  const barRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    let frame = 0;
    let last = -1;
    const step = () => {
      const t = simNow();
      if (t !== null) {
        const pct = Math.round(progressAt(route, index, kind, t) * 1000) / 10;
        if (pct !== last) {
          last = pct;
          if (fillRef.current) fillRef.current.style.width = `${pct}%`;
          if (headRef.current) headRef.current.style.left = `${pct}%`;
          barRef.current?.setAttribute("aria-valuenow", String(Math.round(pct)));
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [route, index, kind]);

  return (
    <span
      ref={barRef}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      className="relative block h-[4px] w-full rounded-full"
      style={{ background: `color-mix(in srgb, ${color} 18%, var(--color-frost))` }}
    >
      <span ref={fillRef} className="sim-progress-fill" style={{ width: 0, background: color }} />
      <span ref={headRef} className="sim-progress-head" style={{ left: 0, background: color }} />
    </span>
  );
}
