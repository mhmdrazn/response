"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";

import { ROUTE_COLORS } from "../../lib/map-constants";
import { routeDuration, routePhase } from "../../lib/route-schedule";
import { simNow, startSim, stopSim } from "../../lib/sim-clock";
import type { RouteOut } from "../../types";
import { useMapContext } from "./map-context";
import { beforeIdFor, geojsonSource, removeOverlay } from "./map-layers";

interface RouteDecoratorsProps {
  routes: RouteOut[];
  highlightId: string | null;
  animating: boolean;
}

const SOURCE = "app-vehicles";
const DOT = "app-vehicles-dot";
const LABEL = "app-vehicles-label";

interface Track {
  route: RouteOut;
  id: string;
  color: string;
  icon: string;
  pts: [number, number][]; // [lon, lat]
  cumDist: number[];
  /** Polyline vertex nearest each visit, searched forward along the route. */
  stopVertex: number[];
}

const trackCache = new WeakMap<RouteOut, Track>();

function buildTrack(r: RouteOut): Track | null {
  const hit = trackCache.get(r);
  if (hit) return hit;
  if (r.polyline.length < 2) return null;
  const pts = r.polyline.map(([la, lo]) => [lo, la] as [number, number]);
  const cumDist: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    cumDist.push(cumDist[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  if (cumDist[cumDist.length - 1] <= 0) return null;
  let from = 0;
  const stopVertex = r.visits.map((v) => {
    let best = from;
    let bestD = Infinity;
    for (let i = from; i < pts.length; i++) {
      const d = (pts[i][0] - v.lon) ** 2 + (pts[i][1] - v.lat) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    from = best;
    return best;
  });
  const color = ROUTE_COLORS[r.route_color_index % ROUTE_COLORS.length];
  const track = {
    route: r,
    id: r.vehicle_id,
    color,
    icon: `app-vehicle-${r.vehicle_id}-${color}`,
    pts,
    cumDist,
    stopVertex,
  };
  trackCache.set(r, track);
  return track;
}

function pointAt(track: Track, target: number, lo: number, hi: number): [number, number] {
  const { pts, cumDist } = track;
  let a = lo;
  let b = hi;
  while (b - a > 1) {
    const mid = (a + b) >> 1;
    if (cumDist[mid] <= target) a = mid;
    else b = mid;
  }
  const seg = cumDist[b] - cumDist[a];
  const w = seg > 0 ? (target - cumDist[a]) / seg : 0;
  return [pts[a][0] + (pts[b][0] - pts[a][0]) * w, pts[a][1] + (pts[b][1] - pts[a][1]) * w];
}

/** The vehicle's spot at simulation time `t`: at a stop while served, else on the road between. */
function positionAt(track: Track, t: number): [number, number] {
  const phase = routePhase(track.route, t);
  const v = track.stopVertex;
  if (phase.kind === "done") return track.pts[v[v.length - 1]];
  if (phase.kind === "stop") return track.pts[v[phase.index]];
  const lo = v[phase.index];
  const hi = v[phase.index + 1];
  if (hi <= lo) return track.pts[lo];
  const target = track.cumDist[lo] + (track.cumDist[hi] - track.cumDist[lo]) * phase.frac;
  return pointAt(track, target, lo, hi);
}

/**
 * The vehicle's badge: a pill in its route colour with its code in white, a white
 * rim, and a small point at the bottom that touches its spot on the road.
 */
function labelImage(text: string, color: string): ImageData | null {
  const ratio = 2;
  const font = getComputedStyle(document.body).fontFamily || "sans-serif";
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return null;
  probe.font = `700 ${10.5 * ratio}px ${font}`;
  const textW = probe.measureText(text).width / ratio;

  const padX = 6;
  const pillH = 17;
  const tipH = 4;
  const rim = 1.5;
  const w = Math.ceil(textW + padX * 2 + rim * 2);
  const h = pillH + tipH + rim * 2;

  const canvas = document.createElement("canvas");
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(ratio, ratio);

  const x0 = rim;
  const y0 = rim;
  const pw = w - rim * 2;
  const r = pillH / 2;
  const cx = w / 2;
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.lineTo(x0 + pw - r, y0);
  ctx.arc(x0 + pw - r, y0 + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(cx + tipH, y0 + pillH);
  ctx.lineTo(cx, y0 + pillH + tipH);
  ctx.lineTo(cx - tipH, y0 + pillH);
  ctx.lineTo(x0 + r, y0 + pillH);
  ctx.arc(x0 + r, y0 + r, r, Math.PI / 2, (3 * Math.PI) / 2);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = rim * 1.4;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 10.5px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, y0 + pillH / 2 + 0.5);

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function ensureLabels(map: MapLibreMap, tracks: Track[]): void {
  for (const tr of tracks) {
    if (map.hasImage(tr.icon)) continue;
    const img = labelImage(tr.id, tr.color);
    if (img) map.addImage(tr.icon, img, { pixelRatio: 2 });
  }
}

/**
 * While animating, each vehicle follows its visit log on the shared simulation
 * clock: it waits at a stop while pumping or draining and drives the road in
 * between (drawn by MapLibre, so it stays on the road while the map moves). All
 * start together; once the longest route is done, they all set off again.
 */
export function RouteDecorators({ routes, highlightId, animating }: RouteDecoratorsProps) {
  const { map, styleVersion } = useMapContext();
  const highlightRef = useRef(highlightId);
  useEffect(() => {
    highlightRef.current = highlightId;
  }, [highlightId]);

  // Built once per route object and cached, so a re-render (hover, pan) is free.
  const tracks = useMemo(
    () => routes.map(buildTrack).filter((t): t is Track => t !== null),
    [routes],
  );
  // The clock restarts only when the simulation is switched on or the plan changes.
  const signature = routes.map((r) => `${r.vehicle_id}:${r.total_time_s}`).join("|");
  const longest = Math.max(0, ...routes.map(routeDuration));
  useEffect(() => {
    if (!animating || !signature) return;
    startSim(longest);
    return () => stopSim();
  }, [animating, signature, longest]);

  useEffect(() => {
    if (!animating || tracks.length === 0) {
      removeOverlay(map, [LABEL, DOT], SOURCE);
      return;
    }
    const frameData = (t: number): GeoJSON.FeatureCollection<GeoJSON.Point> => ({
      type: "FeatureCollection",
      features: tracks.map((tr) => {
        const active = highlightRef.current;
        return {
          type: "Feature",
          properties: {
            color: tr.color,
            icon: tr.icon,
            dim: active !== null && active !== tr.id,
            front: active === tr.id ? 1 : 0,
          },
          geometry: { type: "Point", coordinates: positionAt(tr, t) },
        };
      }),
    });

    ensureLabels(map, tracks);
    if (!geojsonSource(map, SOURCE)) {
      map.addSource(SOURCE, { type: "geojson", data: frameData(simNow() ?? 0) });
      const before = beforeIdFor(map, "app-vehicles");
      map.addLayer(
        {
          id: DOT,
          type: "circle",
          source: SOURCE,
          paint: {
            "circle-color": ["get", "color"],
            "circle-radius": 3.5,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
            "circle-opacity": ["case", ["get", "dim"], 0.3, 1],
            "circle-stroke-opacity": ["case", ["get", "dim"], 0.3, 1],
          },
        },
        before,
      );
      map.addLayer(
        {
          id: LABEL,
          type: "symbol",
          source: SOURCE,
          layout: {
            "icon-image": ["get", "icon"],
            "icon-anchor": "bottom",
            "icon-offset": [0, -2],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "symbol-sort-key": ["get", "front"],
          },
          paint: { "icon-opacity": ["case", ["get", "dim"], 0.3, 1] },
        },
        before,
      );
    }

    let frame = 0;
    let lastKey = "";
    const step = () => {
      const t = simNow();
      if (t !== null) {
        const data = frameData(t);
        // Vehicles spend most of the cycle parked at a stop (pumping, draining,
        // the pause between cycles); skip the source update while nothing moved.
        const key = data.features
          .map((f) => `${f.geometry.coordinates.join(",")}:${f.properties?.dim}:${f.properties?.front}`)
          .join("|");
        if (key !== lastKey) {
          lastKey = key;
          geojsonSource(map, SOURCE)?.setData(data);
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [map, styleVersion, tracks, animating]);

  useEffect(() => () => removeOverlay(map, [LABEL, DOT], SOURCE), [map]);

  return null;
}
