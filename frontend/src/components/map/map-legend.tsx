"use client";

import { Cross, Droplets, Warehouse, type LucideIcon } from "lucide-react";

import { FACILITY_COLORS, ROUTE_COLORS, SI_PALETTE } from "../../lib/map-constants";

const MARKERS: { label: string; color: string; Icon: LucideIcon; round?: boolean }[] = [
  { label: "Depo", color: FACILITY_COLORS.depot, Icon: Warehouse },
  { label: "Buang air", color: FACILITY_COLORS.if, Icon: Droplets },
  { label: "Faskes", color: FACILITY_COLORS.faskes, Icon: Cross, round: true },
];

/**
 * What the map's colours and symbols mean: severity scale, markers and routes.
 * Frameless; the dock or sheet that holds it supplies the card.
 */
export function MapLegend() {
  return (
    <div className="flex flex-col gap-[10px]">
      <section className="flex flex-col gap-[6px]">
        <Heading>Severity Index</Heading>
        <div className="flex h-[8px] overflow-hidden rounded-full">
          {SI_PALETTE.map((b) => (
            <span key={b.labelId} className="flex-1" style={{ background: b.hex }} title={b.labelId} />
          ))}
        </div>
        <div className="flex justify-between text-[10px] font-semibold text-steel">
          <span>{SI_PALETTE[0].labelId}</span>
          <span>{SI_PALETTE[SI_PALETTE.length - 1].labelId}</span>
        </div>
      </section>

      <div aria-hidden className="h-px bg-frost" />

      <section className="flex flex-col gap-[6px]">
        <Heading>Penanda</Heading>
        <ul className="m-0 grid list-none grid-cols-2 gap-x-8 gap-y-[6px] p-0">
          {MARKERS.map(({ label, color, Icon, round }) => (
            <li key={label} className="flex items-center gap-8 text-[11px] font-semibold text-midnight-ink">
              <span
                aria-hidden
                className={`inline-flex h-[16px] w-[16px] flex-shrink-0 items-center justify-center text-white ${
                  round ? "rounded-full" : "rounded-[4px]"
                }`}
                style={{ background: color }}
              >
                <Icon size={10} strokeWidth={2.4} />
              </span>
              {label}
            </li>
          ))}
          <li className="flex items-center gap-8 text-[11px] font-semibold text-midnight-ink">
            <span aria-hidden className="flex h-[16px] w-[16px] flex-shrink-0 items-center">
              <span className="flex h-[4px] w-full overflow-hidden rounded-full">
                {ROUTE_COLORS.slice(0, 4).map((c) => (
                  <span key={c} className="flex-1" style={{ background: c }} />
                ))}
              </span>
            </span>
            Rute
          </li>
        </ul>
      </section>
    </div>
  );
}

function Heading({ children }: { children: string }) {
  return (
    <span className="text-[9.5px] font-bold uppercase tracking-[0.9px] text-slate">{children}</span>
  );
}
