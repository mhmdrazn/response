"use client";

import { TrafficCone } from "lucide-react";

interface TrafficToggleProps {
  /** The backend has a Google Routes API key. */
  available: boolean;
  enabled: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}

/** Whether the next run plans on live traffic instead of free-flow travel times. */
export function TrafficToggle({ available, enabled, onChange, disabled }: TrafficToggleProps) {
  const off = disabled || !available;
  return (
    <section aria-label="Lalu lintas langsung" className="flex flex-col gap-8">
      <div className="flex items-center gap-[6px]">
        <TrafficCone size={12} strokeWidth={2.2} color="var(--color-slate)" aria-hidden />
        <span className="text-slate text-[10px] font-bold tracking-normal uppercase">
          Lalu Lintas
        </span>
        <span className="text-slate ml-auto text-[10px] font-medium">Google Routes</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={off}
        onClick={() => onChange(!enabled)}
        title={
          available
            ? undefined
            : "Atur GOOGLE_MAPS_API_KEY di backend untuk memakai lalu lintas langsung"
        }
        className={`border-frost bg-pure-white flex w-full items-center gap-[10px] rounded-lg border px-[12px] py-[9px] text-left transition-colors ${
          off ? "cursor-not-allowed opacity-60" : "hover:bg-mist cursor-pointer"
        }`}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className="text-midnight-ink text-[12.5px] font-bold">
            Pertimbangkan lalu lintas saat ini
          </span>
          <span className="text-slate text-[11px] leading-[1.35] font-medium">
            {available
              ? "Waktu tempuh disesuaikan dengan kemacetan langsung dari Google."
              : "Belum dikonfigurasi di backend (GOOGLE_MAPS_API_KEY)."}
          </span>
        </span>
        <span
          aria-hidden
          className={`relative h-[20px] w-[34px] flex-shrink-0 rounded-full transition-colors ${
            enabled ? "bg-indigo-ink" : "bg-frost"
          }`}
        >
          <span
            className={`bg-pure-white absolute top-[2px] left-[2px] h-[16px] w-[16px] rounded-full transition-transform duration-200 ${
              enabled ? "translate-x-[14px]" : "translate-x-0"
            }`}
          />
        </span>
      </button>
    </section>
  );
}
