"use client";

import { SI_PALETTE } from "../../lib/map-constants";

/**
 * Legend for the kecamatan choropleth. Unlike the point SI legend (absolute
 * thresholds), this one reads as a RELATIVE ramp because the fill is driven by
 * total severity load normalized across kecamatan (Σ SI ÷ Σ SI tertinggi).
 */
export function ChoroplethLegend() {
  const gradient = `linear-gradient(90deg, ${SI_PALETTE.map((b) => b.hex).join(", ")})`;

  return (
    <div className="pointer-events-auto flex min-w-[168px] flex-col gap-[6px] rounded-lg border border-frost bg-pure-white px-12 py-8">
      <span className="text-[9.5px] font-bold uppercase tracking-[0.9px] text-slate">
        Beban Keparahan Kecamatan
      </span>
      <div className="h-8 rounded-pill" style={{ background: gradient }} />
      <div className="flex justify-between text-[10px] font-medium text-steel">
        <span>Rendah</span>
        <span>Tinggi</span>
      </div>
      <span className="text-[9.5px] font-medium leading-[1.3] text-smoke">
        Σ SI per kecamatan · relatif antar-wilayah
      </span>
    </div>
  );
}
