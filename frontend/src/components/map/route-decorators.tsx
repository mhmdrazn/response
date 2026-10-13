"use client";

import { useEffect, useMemo, useRef } from "react";

import { ROUTE_COLORS } from "../../lib/map-constants";
import type { RouteOut } from "../../types";
import { useMapContext } from "./map-context";
import { geojsonSource, removeOverlay } from "./map-layers";

interface RouteDecoratorsProps {
  routes: RouteOut[];
  highlightId: string | null;
  animating: boolean;
}

const ANIM_DURATION_S = 20;
const SOURCE = "app-vehicles";
const LAYER = "app-vehicles-dot";

interface Track {
  id: string;
  color: string;
  pts: [number, number][]; // [lat, lon]
  cumDist: number[];
  totalDist: number;
}

function interpolate(track: Track, t: number): [number, number] {
  const { pts, cumDist, totalDist } = track;
  const target = t * totalDist;
  let i = 1;
  while (i < cumDist.length - 1 && cumDist[i] < target) i++;
  const segStart = cumDist[i - 1];
  const segLen = cumDist[i] - segStart;
  const frac = segLen > 0 ? (target - segStart) / segLen : 0;
  return [
    pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * frac,
    pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * frac,
  ];
}

/** While animating, one dot per vehicle loops along its route (drawn by MapLibre). */
export function RouteDecorators({ routes, highlightId, animating }: RouteDecoratorsProps) {
  const { map, styleVersion } = useMapContext();
  const highlightRef = useRef(highlightId);
  useEffect(() => {
    highlightRef.current = highlightId;
  }, [highlightId]);

  const tracks = useMemo<Track[]>(
    () =>
      routes
        .filter((r) => r.polyline.length >= 2)
        .map((r) => {
          const pts = r.polyline as [number, number][];
          const cumDist: number[] = [0];
          for (let i = 1; i < pts.length; i++) {
            const dLat = pts[i][0] - pts[i - 1][0];
            const dLon = pts[i][1] - pts[i - 1][1];
            cumDist.push(cumDist[i - 1] + Math.sqrt(dLat * dLat + dLon * dLon));
          }
          return {
            id: r.vehicle_id,
            color: ROUTE_COLORS[r.route_color_index % ROUTE_COLORS.length],
            pts,
            cumDist,
            totalDist: cumDist[cumDist.length - 1],
          };
        }),
    [routes],
  );

  useEffect(() => {
    if (!animating) {
      removeOverlay(map, [LAYER], SOURCE);
      return;
    }
    const frameData = (t: number): GeoJSON.FeatureCollection<GeoJSON.Point> => ({
      type: "FeatureCollection",
      features: tracks
        .filter((tr) => tr.totalDist > 0)
        .map((tr) => ({
          type: "Feature",
          properties: {
            color: tr.color,
            dim: highlightRef.current !== null && highlightRef.current !== tr.id,
          },
          geometry: { type: "Point", coordinates: interpolate(tr, t) },
        })),
    });

    if (!geojsonSource(map, SOURCE)) {
      map.addSource(SOURCE, { type: "geojson", data: frameData(0) });
      map.addLayer({
        id: LAYER,
        type: "circle",
        source: SOURCE,
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 8,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2.5,
          "circle-opacity": ["case", ["get", "dim"], 0.3, 1],
          "circle-stroke-opacity": ["case", ["get", "dim"], 0.3, 1],
        },
      });
    }

    let frame = 0;
    let start: number | null = null;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const t = (((ts - start) / 1000) % ANIM_DURATION_S) / ANIM_DURATION_S;
      geojsonSource(map, SOURCE)?.setData(frameData(t));
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [map, styleVersion, tracks, animating]);

  useEffect(() => () => removeOverlay(map, [LAYER], SOURCE), [map]);

  return null;
}
