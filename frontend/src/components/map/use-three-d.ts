"use client";

import type { Map as MapLibreMap, MapLibreEvent } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AUTO_3D_FULL,
  AUTO_3D_START,
  BUILDINGS_LAYER_ID,
  MAX_ZOOM,
  MIN_ZOOM,
  PITCH_3D,
} from "../../lib/basemap-style";
import { DEFAULT_ZOOM, SURABAYA_CENTER } from "../../lib/map-constants";

/**
 * "auto": tilt follows the zoom (flat when far out, full 3D close in).
 * "manual": 3D switched on by the user, held at any zoom.
 * "flat": 3D switched off by the user while close in; back to auto once zoomed out.
 */
type Mode = "auto" | "manual" | "flat";

/** Tilt for a zoom level in auto mode: none, then easing up to PITCH_3D. */
export function autoPitch(zoom: number): number {
  if (zoom <= AUTO_3D_START) return 0;
  if (zoom >= AUTO_3D_FULL) return PITCH_3D;
  const t = (zoom - AUTO_3D_START) / (AUTO_3D_FULL - AUTO_3D_START);
  return PITCH_3D * t * t * (3 - 2 * t);
}

/**
 * Most tilt allowed at a zoom level. Far out, a steep camera would look past the
 * Surabaya tiles to empty ground, so the tilt opens up as the map zooms in.
 */
export function maxPitch(zoom: number): number {
  const lo = 11.5;
  const hi = 14;
  if (zoom <= lo) return 30;
  if (zoom >= hi) return PITCH_3D;
  return 30 + ((PITCH_3D - 30) * (zoom - lo)) / (hi - lo);
}

const BUILDING_FADE_MS = 450;
const TILT_MS = 900;
/** Turning 3D on zooms in at least this far, where the buildings stand out. */
const ZOOM_3D = 15.6;
/** Most the tilt moves per frame when it catches up after an interrupted tilt. */
const CATCH_UP_DEG = 3;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** True while the user is tilting the map by hand (right-drag, two-finger drag). */
function tiltingByHand(map: MapLibreMap): boolean {
  return map.dragRotate.isActive() || map.touchPitch.isActive();
}

// The map lives outside React; this sets its per-frame camera hook.
function setCameraTransform(map: MapLibreMap, fn: MapLibreMap["transformCameraUpdate"]): void {
  map.transformCameraUpdate = fn;
}

export interface ThreeD {
  /** Buildings up and the camera tilted. */
  active: boolean;
  toggle: () => void;
  /** Zoom by a step, tilting in the same motion when the zoom calls for it. */
  zoomBy: (delta: number) => void;
  recenter: () => void;
}

/**
 * Keeps the camera tilt and the 3D buildings in step with the zoom. The tilt is
 * set on every zoom frame, so it moves together with the user's scroll or pinch.
 */
export function useThreeD(map: MapLibreMap | null, styleVersion: number): ThreeD {
  const mode = useRef<Mode>("auto");
  const manualPitch = useRef(PITCH_3D);
  const tilting = useRef(false);
  // Bumped by every tilt animation, so the end of a superseded one is ignored.
  const tiltGen = useRef(0);
  // The zoom 3D was switched on from, to return to when it is switched off.
  const zoomBefore3D = useRef<number | null>(null);
  const activeRef = useRef(false);
  const [active, setActive] = useState(false);

  const fadeTimer = useRef<number | undefined>(undefined);
  const fullOpacity = useRef(0.92);

  // Buildings fade in and out instead of popping, and drop out of rendering once gone.
  const fadeBuildings = useCallback(
    (on: boolean) => {
      if (!map?.getLayer(BUILDINGS_LAYER_ID)) return;
      window.clearTimeout(fadeTimer.current);
      map.setPaintProperty(BUILDINGS_LAYER_ID, "fill-extrusion-opacity-transition", {
        duration: BUILDING_FADE_MS,
        delay: 0,
      });
      if (on) {
        map.setLayoutProperty(BUILDINGS_LAYER_ID, "visibility", "visible");
        map.setPaintProperty(BUILDINGS_LAYER_ID, "fill-extrusion-opacity", fullOpacity.current);
      } else {
        map.setPaintProperty(BUILDINGS_LAYER_ID, "fill-extrusion-opacity", 0);
        fadeTimer.current = window.setTimeout(() => {
          if (!activeRef.current && map.getLayer(BUILDINGS_LAYER_ID)) {
            map.setLayoutProperty(BUILDINGS_LAYER_ID, "visibility", "none");
          }
        }, BUILDING_FADE_MS);
      }
    },
    [map],
  );

  const show = useCallback(
    (on: boolean) => {
      if (!map || activeRef.current === on) return;
      activeRef.current = on;
      fadeBuildings(on);
      setActive(on);
    },
    [map, fadeBuildings],
  );

  useEffect(() => {
    if (!map) return;
    // Every camera frame passes through here, whether from a scroll, a pinch or an
    // eased move, so in auto mode the tilt is worked out in the same frame as the
    // zoom: no lag, and the scroll's own easing is left alone.
    setCameraTransform(map, (next) => {
      const cap = maxPitch(next.zoom);
      if (tiltingByHand(map)) {
        // A tilt by hand takes over from the zoom and is kept as the 3D tilt.
        if (next.pitch > 3) {
          mode.current = "manual";
          manualPitch.current = Math.min(next.pitch, PITCH_3D);
        }
        return next.pitch > cap ? { pitch: cap } : {};
      }
      // The 3D button's own tilt animation (on or off) carries the tilt while it runs.
      if (tilting.current) return next.pitch > cap ? { pitch: cap } : {};
      if (mode.current === "flat") {
        if (next.zoom < AUTO_3D_START) mode.current = "auto";
        return {};
      }
      if (mode.current === "auto") return { pitch: Math.min(autoPitch(next.zoom), cap) };
      // Manual 3D: hold the chosen tilt, within what the zoom allows. If a tilt was
      // cut short (a scroll mid-animation), close the gap a little per frame.
      const target = Math.min(manualPitch.current, cap);
      const step = Math.max(-CATCH_UP_DEG, Math.min(CATCH_UP_DEG, target - next.pitch));
      return { pitch: Math.min(next.pitch + step, cap) };
    });
    const sync = () =>
      show(mode.current === "manual" || (mode.current === "auto" && map.getPitch() > 0.5));
    const onPitchEnd = (e: MapLibreEvent<Event | undefined>) => {
      if (!e.originalEvent) return;
      if (map.getPitch() < 3) mode.current = autoPitch(map.getZoom()) > 0 ? "flat" : "auto";
      sync();
    };
    // A scroll or pinch of the user's own: switching 3D off stays at that zoom.
    const onZoomStart = (e: MapLibreEvent<Event | undefined>) => {
      if (e.originalEvent) zoomBefore3D.current = null;
    };
    // Tilt set through transformCameraUpdate fires no "pitch" event, so watch every move.
    map.on("move", sync);
    map.on("pitchend", onPitchEnd);
    map.on("zoomstart", onZoomStart);
    return () => {
      setCameraTransform(map, null);
      map.off("move", sync);
      map.off("pitchend", onPitchEnd);
      map.off("zoomstart", onZoomStart);
    };
  }, [map, show]);

  // A new basemap style starts with the buildings as they were; its own opacity
  // is the one they fade up to.
  useEffect(() => {
    if (!map?.getLayer(BUILDINGS_LAYER_ID)) return;
    const styled = map.getPaintProperty(BUILDINGS_LAYER_ID, "fill-extrusion-opacity");
    if (typeof styled === "number" && styled > 0) fullOpacity.current = styled;
    if (!activeRef.current) {
      map.setPaintProperty(BUILDINGS_LAYER_ID, "fill-extrusion-opacity-transition", {
        duration: 0,
        delay: 0,
      });
      map.setPaintProperty(BUILDINGS_LAYER_ID, "fill-extrusion-opacity", 0);
    }
    map.setLayoutProperty(BUILDINGS_LAYER_ID, "visibility", activeRef.current ? "visible" : "none");
  }, [map, styleVersion]);

  useEffect(() => () => window.clearTimeout(fadeTimer.current), []);

  // Eases the camera for the 3D button. Clicking again mid-way starts a new ease
  // from wherever the camera is, so quick clicks reverse smoothly.
  const animateTilt = useCallback(
    (to: { pitch: number; zoom?: number }, done?: () => void) => {
      if (!map) return;
      const gen = ++tiltGen.current;
      tilting.current = true;
      const finish = () => {
        if (gen !== tiltGen.current) return;
        tilting.current = false;
        done?.();
      };
      // easeTo first ends any earlier ease; that one's moveend fires before the
      // listener below exists, and its own listener sees a stale generation.
      map.easeTo({ ...to, duration: TILT_MS, easing: easeInOutCubic });
      if (map.isEasing()) map.once("moveend", finish);
      else finish(); // reduced motion: the move already happened
    },
    [map],
  );

  const toggle = useCallback(() => {
    if (!map) return;
    if (activeRef.current) {
      mode.current = "flat";
      show(false);
      // Back down to flat, and back out to where 3D was switched on from.
      // Kept until the ease ends, so a quick on-off-on still returns to the start.
      const back = zoomBefore3D.current;
      const zoom = back != null && back < map.getZoom() ? back : undefined;
      animateTilt({ pitch: 0, ...(zoom != null ? { zoom } : {}) }, () => {
        zoomBefore3D.current = null;
        // Turned off where auto tilt wouldn't tilt anyway: back to auto right away.
        if (map.getZoom() < AUTO_3D_START) mode.current = "auto";
      });
    } else {
      mode.current = "manual";
      manualPitch.current = PITCH_3D;
      show(true);
      // Close enough in for the buildings to read as 3D.
      const from = map.getZoom();
      const zoom = Math.max(from, ZOOM_3D);
      if (zoomBefore3D.current == null) zoomBefore3D.current = from;
      animateTilt({ pitch: maxPitch(zoom), zoom });
    }
  }, [map, show, animateTilt]);

  const zoomBy = useCallback(
    (delta: number) => {
      if (!map) return;
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, map.getZoom() + delta));
      // A zoom of the user's own: switching 3D off stays at it.
      zoomBefore3D.current = null;
      // In auto mode the tilt follows along through transformCameraUpdate.
      map.easeTo({ zoom, duration: 300 });
    },
    [map],
  );

  const recenter = useCallback(() => {
    if (!map) return;
    zoomBefore3D.current = null;
    map.flyTo({
      center: SURABAYA_CENTER,
      zoom: DEFAULT_ZOOM,
      bearing: 0,
      pitch:
        mode.current === "manual"
          ? Math.min(manualPitch.current, maxPitch(DEFAULT_ZOOM))
          : autoPitch(DEFAULT_ZOOM),
      duration: 900,
    });
  }, [map]);

  return useMemo(() => ({ active, toggle, zoomBy, recenter }), [active, toggle, zoomBy, recenter]);
}
