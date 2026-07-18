"use client";

import type { Layer, PathOptions } from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { GeoJSON } from "react-leaflet";

import {
  aggregateSiByKecamatan,
  type KecamatanFeature,
  type KecamatanStat,
} from "../../lib/choropleth";
import { siColor, siLabel } from "../../lib/map-constants";
import type { FloodPoint } from "../../types";

interface ChoroplethLayerProps {
  floods: FloodPoint[];
}

interface KecamatanCollection {
  type: "FeatureCollection";
  features: KecamatanFeature[];
}

const GEOJSON_URL = "/data/surabaya-kecamatan.geojson";

// Neutral fill for kecamatan with no flood observations.
const EMPTY_FILL = "#e5e5e5";
const BORDER = "#525252";

function featureStyle(stat: KecamatanStat | undefined): PathOptions {
  if (!stat || stat.count === 0) {
    return {
      color: BORDER,
      weight: 0.8,
      opacity: 0.35,
      fillColor: EMPTY_FILL,
      fillOpacity: 0.15,
      dashArray: "3 3",
    };
  }
  // Fill by relative total severity load, not the mean.
  return {
    color: BORDER,
    weight: 1,
    opacity: 0.45,
    fillColor: siColor(stat.loadNorm),
    fillOpacity: 0.55,
  };
}

function tooltipHtml(name: string, stat: KecamatanStat): string {
  const rows =
    stat.count === 0
      ? `<div style="padding-top:6px;border-top:1px solid var(--color-frost);font-size:12px;color:var(--color-steel);font-weight:var(--font-weight-medium);">Tidak ada data genangan</div>`
      : `<div style="padding-top:6px;border-top:1px solid var(--color-frost);display:flex;flex-direction:column;gap:4px;">
          ${row("Beban keparahan", loadPill(stat))}
          ${row("Titik genangan", `${stat.count}`)}
          ${row("Rata-rata SI", stat.meanSi.toFixed(2))}
          ${row("SI tertinggi", stat.maxSi.toFixed(2))}
        </div>`;

  return `<div style="max-width:240px;min-width:180px;display:flex;flex-direction:column;gap:6px;">
      <div style="display:flex;flex-direction:column;gap:2px;">
        <div style="font-size:13.5px;color:var(--color-midnight-ink);font-weight:var(--font-weight-bold);letter-spacing:-0.15px;line-height:1.3;">${escapeHtml(
          name,
        )}</div>
        <div style="font-size:11.5px;color:var(--color-slate);font-weight:var(--font-weight-medium);letter-spacing:-0.1px;">Kecamatan</div>
      </div>
      ${rows}
    </div>`;
}

function row(label: string, value: string): string {
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12.5px;">
      <span style="color:var(--color-slate);font-weight:var(--font-weight-semibold);">${label}</span>
      <span style="color:var(--color-midnight-ink);font-weight:var(--font-weight-bold);text-align:right;">${value}</span>
    </div>`;
}

// Pill colored by the same relative-load ramp as the fill; label reflects the
// relative tier, and the raw Σ SI is shown so the number isn't hidden.
function loadPill(stat: KecamatanStat): string {
  return `<span style="display:inline-flex;align-items:center;border-radius:var(--radius-md);padding:1px 8px;font-size:11px;background:${siColor(
    stat.loadNorm,
  )};color:#ffffff;font-weight:var(--font-weight-bold);letter-spacing:0.2px;white-space:nowrap;">${siLabel(
    stat.loadNorm,
  )} · Σ ${stat.totalLoad.toFixed(2)}</span>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

export function ChoroplethLayer({ floods }: ChoroplethLayerProps) {
  const [collection, setCollection] = useState<KecamatanCollection | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(GEOJSON_URL)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: KecamatanCollection) => {
        if (!cancelled) setCollection(data);
      })
      .catch(() => {
        /* Layer silently no-ops if the boundary file is unavailable. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(
    () => (collection ? aggregateSiByKecamatan(floods, collection.features) : null),
    [collection, floods],
  );

  // react-leaflet's GeoJSON snapshots data/style on mount; a signature key
  // remounts it when the underlying aggregation changes.
  const signature = useMemo(() => {
    if (!stats) return "empty";
    let s = "";
    for (const [code, st] of stats) s += `${code}:${st.count}:${st.loadNorm.toFixed(3)};`;
    return s;
  }, [stats]);

  if (!collection || !stats) return null;

  return (
    <GeoJSON
      key={signature}
      data={collection}
      style={(feature) => {
        const code = (feature?.properties as { code?: string } | undefined)?.code;
        return featureStyle(code ? stats.get(code) : undefined);
      }}
      onEachFeature={(feature, layer: Layer) => {
        const props = feature.properties as { kecamatan: string; code: string };
        const stat = stats.get(props.code) ?? {
          count: 0,
          meanSi: 0,
          maxSi: 0,
          totalLoad: 0,
          loadNorm: 0,
        };
        layer.bindTooltip(tooltipHtml(props.kecamatan, stat), {
          sticky: true,
          direction: "top",
          opacity: 1,
        });
      }}
    />
  );
}
