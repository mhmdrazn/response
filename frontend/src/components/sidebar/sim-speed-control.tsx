"use client";

import { SIM_SPEEDS, setSimSpeed, useSimSpeed, type SimSpeed } from "../../lib/sim-clock";

/** The speed as a multiple of the default pace (60 simulated seconds per second). */
function multiple(s: SimSpeed): string {
  const x = s / 60;
  return `${x.toLocaleString("id-ID", { maximumFractionDigits: 1 })}×`;
}

/** How long one real second is in the simulation, for the tooltip. */
function pace(s: SimSpeed): string {
  return s < 60 ? `1 detik = ${s} detik simulasi` : `1 detik = ${s / 60} menit simulasi`;
}

/** Playback speed of the vehicle simulation; changing it keeps the vehicles where they are. */
export function SimSpeedControl() {
  const speed = useSimSpeed();
  return (
    <div
      role="radiogroup"
      aria-label="Kecepatan simulasi"
      className="bg-mist inline-flex flex-shrink-0 items-center gap-[2px] rounded-md p-[2px]"
    >
      {SIM_SPEEDS.map((s) => {
        const on = s === speed;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={on}
            title={pace(s)}
            onClick={() => setSimSpeed(s)}
            className={`cursor-pointer rounded-[5px] border-0 px-[6px] py-[3px] text-[10.5px] font-bold tabular-nums transition-colors ${
              on ? "bg-pure-white text-midnight-ink" : "text-slate hover:text-steel bg-transparent"
            }`}
          >
            {multiple(s)}
          </button>
        );
      })}
    </div>
  );
}
