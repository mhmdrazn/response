"use client";

import L from "leaflet";
import { useCallback, useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

import { ROUTE_COLORS } from "../../lib/map-constants";
import type { RouteOut } from "../../types";

interface RouteDecoratorsProps {
  routes: RouteOut[];
  highlightId: string | null;
  animating: boolean;
}

const ARROW_SPACING_PX = 90;
const ANIM_DURATION_S = 20;

function bearing(p1: [number, number], p2: [number, number]): number {
  const toRad = Math.PI / 180;
  const dLon = (p2[1] - p1[1]) * toRad;
  const lat1 = p1[0] * toRad;
  const lat2 = p2[0] * toRad;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function arrowIcon(color: string, angle: number): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    html: `<svg width="12" height="12" viewBox="0 0 12 12" style="transform:rotate(${angle}deg)"><polygon points="6,1 11,11 6,8 1,11" fill="${color}" opacity="0.85"/></svg>`,
  });
}

function vehicleIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 0 6px ${color}40"></div>`,
  });
}

function interpolate(
  pts: [number, number][],
  cumDist: number[],
  totalDist: number,
  t: number,
): [number, number] {
  const target = t * totalDist;
  let i = 1;
  while (i < cumDist.length - 1 && cumDist[i] < target) i++;
  const segStart = cumDist[i - 1];
  const segLen = cumDist[i] - segStart;
  const frac = segLen > 0 ? (target - segStart) / segLen : 0;
  return [
    pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * frac,
    pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * frac,
  ];
}

function pixelDist(map: L.Map, a: [number, number], b: [number, number]): number {
  const pa = map.latLngToContainerPoint(a);
  const pb = map.latLngToContainerPoint(b);
  return Math.sqrt((pa.x - pb.x) ** 2 + (pa.y - pb.y) ** 2);
}

export function RouteDecorators({ routes, highlightId, animating }: RouteDecoratorsProps) {
  const map = useMap();
  const arrowLayer = useRef<L.LayerGroup>(L.layerGroup());
  const vehicleMarkers = useRef<Map<string, L.Marker>>(new Map());
  const animRef = useRef<number>(0);
  const routeDataRef = useRef<
    Map<string, { pts: [number, number][]; cumDist: number[]; totalDist: number }>
  >(new Map());

  const buildArrows = useCallback(() => {
    arrowLayer.current.clearLayers();

    for (const r of routes) {
      const pts = r.polyline as [number, number][];
      if (pts.length < 2) continue;
      const color = ROUTE_COLORS[r.route_color_index % ROUTE_COLORS.length];
      const dimmed = highlightId !== null && highlightId !== r.vehicle_id;

      let accPx = ARROW_SPACING_PX * 0.6;
      for (let i = 1; i < pts.length; i++) {
        const d = pixelDist(map, pts[i - 1], pts[i]);
        accPx += d;
        if (accPx >= ARROW_SPACING_PX) {
          accPx = 0;
          const angle = bearing(pts[i - 1], pts[i]);
          const mid: [number, number] = [
            (pts[i - 1][0] + pts[i][0]) / 2,
            (pts[i - 1][1] + pts[i][1]) / 2,
          ];
          const marker = L.marker(mid, {
            icon: arrowIcon(color, angle),
            interactive: false,
            keyboard: false,
          });
          if (dimmed) marker.setOpacity(0.3);
          arrowLayer.current.addLayer(marker);
        }
      }
    }
  }, [routes, highlightId, map]);

  useEffect(() => {
    arrowLayer.current.addTo(map);
    return () => {
      arrowLayer.current.remove();
    };
  }, [map]);

  useEffect(() => {
    buildArrows();
    map.on("zoomend", buildArrows);
    return () => {
      map.off("zoomend", buildArrows);
    };
  }, [map, buildArrows]);

  // Vehicle animation — only when animating=true
  useEffect(() => {
    if (!animating) {
      for (const m of vehicleMarkers.current.values()) m.remove();
      vehicleMarkers.current.clear();
      routeDataRef.current.clear();
      cancelAnimationFrame(animRef.current);
      return;
    }

    for (const r of routes) {
      const pts = r.polyline as [number, number][];
      if (pts.length < 2) continue;
      const color = ROUTE_COLORS[r.route_color_index % ROUTE_COLORS.length];

      const cumDist: number[] = [0];
      for (let i = 1; i < pts.length; i++) {
        const dLat = pts[i][0] - pts[i - 1][0];
        const dLon = pts[i][1] - pts[i - 1][1];
        cumDist.push(cumDist[i - 1] + Math.sqrt(dLat * dLat + dLon * dLon));
      }
      const totalDist = cumDist[cumDist.length - 1];
      routeDataRef.current.set(r.vehicle_id, { pts, cumDist, totalDist });

      if (!vehicleMarkers.current.has(r.vehicle_id)) {
        const marker = L.marker(pts[0], {
          icon: vehicleIcon(color),
          interactive: false,
          keyboard: false,
          zIndexOffset: 1000,
        }).addTo(map);
        vehicleMarkers.current.set(r.vehicle_id, marker);
      }
    }

    let startTime: number | null = null;

    function animate(ts: number) {
      if (startTime === null) startTime = ts;
      const elapsed = (ts - startTime) / 1000;
      const t = (elapsed % ANIM_DURATION_S) / ANIM_DURATION_S;

      for (const [id, data] of routeDataRef.current) {
        const marker = vehicleMarkers.current.get(id);
        if (!marker || data.totalDist === 0) continue;
        const pos = interpolate(data.pts, data.cumDist, data.totalDist, t);
        marker.setLatLng(pos);
      }

      animRef.current = requestAnimationFrame(animate);
    }

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [routes, map, animating]);

  useEffect(() => {
    if (!animating) return;
    for (const r of routes) {
      const marker = vehicleMarkers.current.get(r.vehicle_id);
      if (!marker) continue;
      const dimmed = highlightId !== null && highlightId !== r.vehicle_id;
      marker.setOpacity(dimmed ? 0.3 : 1);
    }
  }, [highlightId, routes, animating]);

  return null;
}
