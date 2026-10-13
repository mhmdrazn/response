"use client";

import type { GeoJSONSource } from "maplibre-gl";
import { useEffect, useMemo, useState } from "react";

import {
  aggregateSiByKecamatan,
  type KecamatanFeature,
  type KecamatanStat,
} from "../../lib/choropleth";
import { siColor, siLabel } from "../../lib/map-constants";
import type { FloodPoint } from "../../types";
import { HoverTooltip, hitsLayers, useLayerHover } from "./hover-tooltip";
import { POINT_HIT_LAYERS, useMapContext } from "./map-context";
import { beforeIdFor } from "./map-layers";
import { ROUTE_HIT_LAYER } from "./route-polylines";

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

const SOURCE = "app-choropleth";
const FILL = "app-choropleth-fill";
const LINE = "app-choropleth-line";
const LINE_EMPTY = "app-choropleth-line-empty";

const EMPTY_STAT: KecamatanStat = { count: 0, meanSi: 0, maxSi: 0, totalLoad: 0, loadNorm: 0 };

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
  const { map, styleVersion } = useMapContext();
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

  // Fill by relative total severity load, not the mean; kecamatan without
  // flood observations get a faint neutral fill and a dashed border.
  const data = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!collection || !stats) return null;
    return {
      type: "FeatureCollection",
      features: collection.features.map((f, i) => {
        const props = f.properties as { kecamatan: string; code: string };
        const stat = stats.get(props.code);
        const empty = !stat || stat.count === 0;
        return {
          ...(f as GeoJSON.Feature),
          id: i,
          properties: {
            ...props,
            empty,
            fill: empty ? EMPTY_FILL : siColor(stat.loadNorm),
            fillOpacity: empty ? 0.15 : 0.55,
          },
        };
      }),
    };
  }, [collection, stats]);

  useEffect(() => {
    if (!data) return;
    const src = map.getSource(SOURCE) as GeoJSONSource | undefined;
    if (src) src.setData(data);
    else map.addSource(SOURCE, { type: "geojson", data });
    // Under the routes and the basemap labels, over the ground.
    const before = beforeIdFor(map, "app-choropleth");
    if (!map.getLayer(FILL)) {
      map.addLayer(
        {
          id: FILL,
          type: "fill",
          source: SOURCE,
          paint: { "fill-color": ["get", "fill"], "fill-opacity": ["get", "fillOpacity"] },
        },
        before,
      );
    }
    if (!map.getLayer(LINE)) {
      map.addLayer(
        {
          id: LINE,
          type: "line",
          source: SOURCE,
          filter: ["!", ["get", "empty"]],
          paint: { "line-color": BORDER, "line-width": 1, "line-opacity": 0.45 },
        },
        before,
      );
    }
    if (!map.getLayer(LINE_EMPTY)) {
      map.addLayer(
        {
          id: LINE_EMPTY,
          type: "line",
          source: SOURCE,
          filter: ["get", "empty"],
          paint: {
            "line-color": BORDER,
            "line-width": 0.8,
            "line-opacity": 0.35,
            "line-dasharray": [3, 3],
          },
        },
        before,
      );
    }
  }, [map, styleVersion, data]);

  useEffect(
    () => () => {
      if (!map.style) return;
      for (const id of [LINE_EMPTY, LINE, FILL]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    },
    [map],
  );

  const hover = useLayerHover(FILL, data !== null);
  if (!hover || !stats) return null;
  // A route or point under the pointer shows its own tooltip; don't stack two.
  if (hitsLayers(map, hover.x, hover.y, [ROUTE_HIT_LAYER, ...POINT_HIT_LAYERS])) return null;
  const props = hover.feature.properties as { kecamatan: string; code: string };

  return (
    <HoverTooltip x={hover.x} y={hover.y}>
      <div
        dangerouslySetInnerHTML={{
          __html: tooltipHtml(props.kecamatan, stats.get(props.code) ?? EMPTY_STAT),
        }}
      />
    </HoverTooltip>
  );
}
