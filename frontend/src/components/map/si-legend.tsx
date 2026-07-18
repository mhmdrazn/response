"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { SI_PALETTE } from "../../lib/map-constants";

interface SiLegendProps {
  /** true: flow layout inside a dock stack (mobile). false (default):
   *  absolute-positioned floating legend over the map (desktop). */
  inline?: boolean;
  /** Deprecated: the chevron is now always shown. Kept for compatibility. */
  collapsible?: boolean;
  /** Initial open state. */
  defaultOpen?: boolean;
}

export function SiLegend({ inline = false, defaultOpen = false }: SiLegendProps) {
  const [open, setOpen] = useState(defaultOpen);

  const positionClass = inline
    ? "static"
    : "absolute bottom-24 right-16 z-[800] min-w-[150px]";

  const swatches = (
    <div
      className={`flex flex-col gap-[5px] overflow-hidden transition-[max-height,opacity,margin-top,padding-top] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
        open
          ? "mt-[4px] max-h-[240px] border-t border-frost pt-[6px] opacity-100"
          : "mt-0 max-h-0 border-t border-transparent pt-0 opacity-0"
      }`}
    >
      {SI_PALETTE.map((bucket) => (
        <div key={bucket.labelId} className="flex items-center gap-8">
          <span
            className="h-[10px] w-[10px] flex-shrink-0 rounded-full"
            style={{ background: bucket.hex }}
          />
          <span className="text-[11px] font-medium tracking-[-0.11px] text-midnight-ink">
            {bucket.labelId}
          </span>
          <span className="ml-auto text-[10px] text-steel tabular-nums">
            ≤ {bucket.max.toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <div
      className={`${positionClass} pointer-events-auto flex flex-col rounded-lg border border-frost bg-pure-white px-12 py-8`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-[6px] border-0 bg-transparent p-0"
      >
        <span className="text-[9.5px] font-bold uppercase tracking-[0.9px] text-slate">
          Severity Index
        </span>
        <ChevronDown
          size={14}
          color="var(--color-slate)"
          className={`transition-transform duration-[220ms] ${open ? "rotate-0" : "-rotate-90"}`}
        />
      </button>
      {swatches}
    </div>
  );
}
