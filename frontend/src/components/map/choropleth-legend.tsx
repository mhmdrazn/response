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
    <div
      style={{
        background: "var(--color-pure-white)",
        border: "1px solid var(--color-frost)",
        borderRadius: "var(--radius-lg)",
        padding: "8px 12px",
        pointerEvents: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 168,
      }}
    >
      <span
        style={{
          fontSize: 9.5,
          textTransform: "uppercase",
          letterSpacing: "0.9px",
          fontWeight: "var(--font-weight-bold)",
          color: "var(--color-slate)",
        }}
      >
        Beban Keparahan Kecamatan
      </span>
      <div
        style={{
          height: 8,
          borderRadius: "var(--radius-pill)",
          background: gradient,
        }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: "var(--color-steel)",
          fontWeight: "var(--font-weight-medium)",
        }}
      >
        <span>Rendah</span>
        <span>Tinggi</span>
      </div>
      <span
        style={{
          fontSize: 9.5,
          color: "var(--color-smoke)",
          fontWeight: "var(--font-weight-medium)",
          lineHeight: 1.3,
        }}
      >
        Σ SI per kecamatan · relatif antar-wilayah
      </span>
    </div>
  );
}
