"use client";

import type {
  ExpressionSpecification,
  Map as MapLibreMap,
  MapSourceDataEvent,
  VectorTileSource,
} from "maplibre-gl";
import { useEffect, useRef } from "react";

import { refreshTrafficTilesStatus } from "../../hooks/use-traffic-tiles-status";
import {
  TRAFFIC_BOUNDS,
  TRAFFIC_LEGEND,
  TRAFFIC_MAX_ZOOM,
  TRAFFIC_MIN_ZOOM,
  TRAFFIC_REFRESH_MS,
  TRAFFIC_TILE_URL,
} from "../../lib/tomtom-traffic";
import { useMapContext } from "./map-context";
import { beforeIdFor, removeOverlay } from "./map-layers";

export type TrafficStatusState = { kind: "loading" } | { kind: "ready"; updatedAt: Date };

interface TrafficLayerProps {
  onStatus: (status: TrafficStatusState) => void;
}

const SOURCE = "app-traffic";
const CASING = "app-traffic-casing";
const LINE = "app-traffic-line";
const SOURCE_LAYER = "Traffic flow";
const OPACITY = 0.92;
const FADE_MS = 450;

const [LANCAR, RAMAI, PADAT, MACET] = TRAFFIC_LEGEND.map((t) => t.color);
const MAJOR = ["Motorway", "International road", "Major road"];
const SECONDARY = ["Secondary road", "Connecting road"];

/** A value per road class: main roads widest, local streets thinnest. */
function byRoad(major: number, secondary: number, local: number): ExpressionSpecification {
  return ["match", ["get", "road_type"], MAJOR, major, SECONDARY, secondary, local];
}

/** Line width in px, growing smoothly with the zoom; `extra` widens every stop (the casing). */
function widthPlus(extra: number): ExpressionSpecification {
  return [
    "interpolate",
    ["exponential", 1.5],
    ["zoom"],
    10,
    byRoad(1.6 + extra, 1 + extra, 0.5 + extra),
    13,
    byRoad(3 + extra, 2 + extra, 1.2 + extra),
    16,
    byRoad(6 + extra, 4.5 + extra, 3 + extra),
    19,
    byRoad(12 + extra, 9 + extra, 6 + extra),
  ];
}
const WIDTH = widthPlus(0);

/**
 * A road whose two directions flow differently comes as one line per side; each is
 * nudged to its own side of the road (the left, in left-hand traffic).
 */
function offsetAt(px: ExpressionSpecification): ExpressionSpecification {
  return [
    "case",
    ["==", ["get", "traffic_road_coverage"], "one_side"],
    ["*", ["case", ["==", ["get", "left_hand_traffic"], true], -1, 1], px],
    0,
  ];
}
const OFFSET: ExpressionSpecification = [
  "interpolate",
  ["exponential", 1.5],
  ["zoom"],
  10,
  offsetAt(byRoad(0.9, 0.6, 0.3)),
  13,
  offsetAt(byRoad(1.7, 1.1, 0.7)),
  16,
  offsetAt(byRoad(3.3, 2.5, 1.7)),
  19,
  offsetAt(byRoad(6.5, 5, 3.4)),
];

/** traffic_level is current speed over free-flow speed: 1 flows freely, 0 stands still. */
const COLOR: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["coalesce", ["get", "traffic_level"], 1],
  0,
  MACET,
  0.3,
  PADAT,
  0.55,
  RAMAI,
  0.8,
  LANCAR,
];

/**
 * The tile URL for the current refresh window. Everyone in the same window asks
 * for the same URLs, so a CDN can answer them from one upstream call.
 */
function tileUrl(): string {
  const window_ = Math.floor(Date.now() / TRAFFIC_REFRESH_MS);
  return `${location.origin}${TRAFFIC_TILE_URL}?v=${window_}`;
}

// Switching the layer off fades it out before it is removed; switching it back on
// in the meantime keeps it.
let pendingRemoval: number | undefined;

function setOpacity(map: MapLibreMap, value: number): void {
  if (!map.style) return; // the map itself is gone
  if (map.getLayer(LINE)) map.setPaintProperty(LINE, "line-opacity", value);
  if (map.getLayer(CASING)) map.setPaintProperty(CASING, "line-opacity", value * 0.55);
}

/**
 * TomTom's live traffic drawn by the map as lines, under the routes and points.
 * Vector lines stay sharp and change width smoothly while zooming, and above the
 * last tile zoom the same tiles are reused. Visual only: nothing here feeds the
 * travel times or the routing.
 */
export function TrafficLayer({ onStatus }: TrafficLayerProps) {
  const { map, styleVersion } = useMapContext();
  const statusRef = useRef(onStatus);
  useEffect(() => {
    statusRef.current = onStatus;
  });

  useEffect(() => {
    window.clearTimeout(pendingRemoval);
    if (!map.getSource(SOURCE)) {
      map.addSource(SOURCE, {
        type: "vector",
        tiles: [tileUrl()],
        minzoom: TRAFFIC_MIN_ZOOM,
        maxzoom: TRAFFIC_MAX_ZOOM,
        bounds: TRAFFIC_BOUNDS,
        attribution: "Lalu lintas © TomTom",
      });
    }
    const before = beforeIdFor(map, "app-traffic");
    const transition = { duration: FADE_MS, delay: 0 };
    if (!map.getLayer(CASING)) {
      // A soft light edge under each line keeps it legible over any basemap.
      map.addLayer(
        {
          id: CASING,
          type: "line",
          source: SOURCE,
          "source-layer": SOURCE_LAYER,
          minzoom: TRAFFIC_MIN_ZOOM,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#ffffff",
            "line-width": widthPlus(2),
            "line-offset": OFFSET,
            "line-blur": 1,
            "line-opacity": 0,
            "line-opacity-transition": transition,
          },
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
          "source-layer": SOURCE_LAYER,
          minzoom: TRAFFIC_MIN_ZOOM,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": COLOR,
            "line-width": WIDTH,
            "line-offset": OFFSET,
            "line-blur": 0.4,
            "line-opacity": 0,
            "line-opacity-transition": transition,
          },
        },
        before,
      );
    }
    // Set after the layer exists, so it fades in rather than popping.
    requestAnimationFrame(() => setOpacity(map, OPACITY));
    statusRef.current({ kind: "ready", updatedAt: new Date() });
    // Once the first tiles are in, show the updated count.
    const onIdle = () => void refreshTrafficTilesStatus();
    map.once("idle", onIdle);

    // Fresh tiles every few minutes, only while someone can see them. The old
    // lines stay drawn until the new tiles arrive.
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      const src = map.getSource(SOURCE) as VectorTileSource | undefined;
      src?.setTiles([tileUrl()]);
      statusRef.current({ kind: "ready", updatedAt: new Date() });
      void refreshTrafficTilesStatus();
    };
    const timer = window.setInterval(refresh, TRAFFIC_REFRESH_MS);

    // A refused tile (the cap reached, a bad key): ask the server why, once.
    let checking = false;
    const onError = (e: { sourceId?: string } & Partial<MapSourceDataEvent>) => {
      if (e.sourceId !== SOURCE || checking) return;
      checking = true;
      void refreshTrafficTilesStatus().finally(() => {
        window.setTimeout(() => (checking = false), 30_000);
      });
    };
    map.on("error", onError);
    return () => {
      window.clearInterval(timer);
      map.off("error", onError);
      map.off("idle", onIdle);
    };
  }, [map, styleVersion]);

  useEffect(
    () => () => {
      setOpacity(map, 0);
      window.clearTimeout(pendingRemoval);
      pendingRemoval = window.setTimeout(
        () => {
          if (map.style) removeOverlay(map, [LINE, CASING], SOURCE);
        },
        FADE_MS,
      );
    },
    [map],
  );

  return null;
}
