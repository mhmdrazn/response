"use client";

import type { MapGeoJSONFeature, MapLayerMouseEvent } from "maplibre-gl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useMap } from "./map-context";

export interface HoverState {
  x: number;
  y: number;
  feature: MapGeoJSONFeature;
}

/**
 * Tracks the pointer over one map layer. Returns the hovered feature and where
 * the pointer is, for a tooltip that follows it (Leaflet's "sticky" tooltip).
 */
export function useLayerHover(
  layerId: string,
  enabled: boolean,
  handlers: {
    onEnter?: (f: MapGeoJSONFeature) => void;
    onLeave?: () => void;
    onClick?: (f: MapGeoJSONFeature) => void;
  } = {},
  /** Layers drawn above this one: a click that lands on them is theirs. */
  blockedBy: string[] = [],
): HoverState | null {
  const map = useMap();
  const [hover, setHover] = useState<HoverState | null>(null);
  const ref = useRef(handlers);
  const blockedRef = useRef(blockedBy);
  useEffect(() => {
    ref.current = handlers;
    blockedRef.current = blockedBy;
  });

  useEffect(() => {
    if (!enabled) return;
    let current: string | number | undefined;
    // After a click the tooltip stays away until the pointer moves to another feature:
    // the detail panel that opens can land under the pointer and cover the map.
    let clicked: string | number | undefined;
    const move = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const key = f.id ?? (f.properties?.id as string | undefined);
      if (key !== current) {
        current = key;
        clicked = undefined;
        ref.current.onEnter?.(f);
      }
      setHover(key === clicked ? null : { x: e.point.x, y: e.point.y, feature: f });
    };
    const leave = () => {
      if (current === undefined) return;
      map.getCanvas().style.cursor = "";
      current = undefined;
      clicked = undefined;
      setHover(null);
      ref.current.onLeave?.();
    };
    const click = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f || hitsLayers(map, e.point.x, e.point.y, blockedRef.current)) return;
      clicked = f.id ?? (f.properties?.id as string | undefined);
      setHover(null);
      ref.current.onClick?.(f);
    };
    // Leaving the canvas (onto a panel, say) never fires the layer's mouseleave.
    const out = () => leave();
    const canvas = map.getCanvas();
    map.on("mousemove", layerId, move);
    map.on("mouseleave", layerId, leave);
    map.on("click", layerId, click);
    canvas.addEventListener("mouseleave", out);
    map.on("movestart", out);
    return () => {
      map.off("mousemove", layerId, move);
      map.off("mouseleave", layerId, leave);
      map.off("click", layerId, click);
      canvas.removeEventListener("mouseleave", out);
      map.off("movestart", out);
    };
  }, [map, layerId, enabled]);

  return enabled ? hover : null;
}

/** A tooltip pinned above a point on the map (the pointer, or a marker), drawn over the canvas. */
export function HoverTooltip({
  x,
  y,
  gap = 14,
  children,
}: {
  x: number;
  y: number;
  /** Space in px between the point and the tooltip's bottom edge. */
  gap?: number;
  children: ReactNode;
}) {
  const map = useMap();
  return createPortal(
    <div
      className="map-hover-tooltip"
      style={{ left: x, top: y, transform: `translate(-50%, calc(-100% - ${gap}px))` }}
    >
      {children}
    </div>,
    map.getContainer(),
  );
}

/** Whether any of the given layers has a feature under the screen point. */
export function hitsLayers(
  map: ReturnType<typeof useMap>,
  x: number,
  y: number,
  ids: string[],
): boolean {
  const layers = ids.filter((id) => map.getLayer(id));
  return layers.length > 0 && map.queryRenderedFeatures([x, y], { layers }).length > 0;
}
