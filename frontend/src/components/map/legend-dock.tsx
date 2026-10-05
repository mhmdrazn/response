"use client";

import { ChevronDown, Palette } from "lucide-react";
import { useState } from "react";

import { MapLegend } from "./map-legend";

interface LegendDockProps {
  defaultOpen?: boolean;
}

/** Collapsible card holding the map legend, stacked with the other sidebar docks. */
export function LegendDock({ defaultOpen = false }: LegendDockProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      data-open={open}
      className="legend-dock pointer-events-auto flex flex-col rounded-lg border border-frost bg-pure-white"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="font-manrope flex w-full cursor-pointer items-center gap-[6px] border-0 bg-transparent px-[10px] py-8 text-left"
      >
        <Palette size={14} strokeWidth={2} color="var(--color-slate)" />
        <span className="flex-1 text-[11px] font-bold tracking-[-0.1px] text-midnight-ink">
          Legenda
        </span>
        <ChevronDown
          size={14}
          color="var(--color-slate)"
          className={`transition-transform duration-[220ms] ${open ? "rotate-0" : "-rotate-90"}`}
        />
      </button>

      <div
        className={`flex flex-col transition-[max-height,opacity,padding] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
          open
            ? "pointer-events-auto max-h-[320px] overflow-auto border-t border-frost px-12 pb-12 pt-[10px] opacity-100"
            : "pointer-events-none max-h-0 overflow-hidden border-t border-transparent px-12 py-0 opacity-0"
        }`}
      >
        <MapLegend />
      </div>
    </div>
  );
}
