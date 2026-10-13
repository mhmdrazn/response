"use client";

import maplibregl, { type PositionAnchor } from "maplibre-gl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useMap } from "./map-context";

interface HtmlMarkerProps {
  lon: number;
  lat: number;
  /** Markup of the icon; only its elements with pointer events take clicks. */
  html: string;
  anchor?: PositionAnchor;
  zIndex?: number;
  opacity?: number;
  onClick?: () => void;
  /** Shown above the marker while hovered. */
  tooltip?: ReactNode;
  /** Gap in px between the marker's centre and the tooltip's bottom edge. */
  tooltipOffset?: number;
  draggable?: boolean;
  onDragEnd?: (lat: number, lon: number) => void;
}

interface MarkerParts {
  root: HTMLDivElement;
  icon: HTMLDivElement;
  tip: HTMLDivElement;
}

function createParts(): MarkerParts {
  const root = document.createElement("div");
  root.className = "map-marker";
  const icon = document.createElement("div");
  const tip = document.createElement("div");
  tip.className = "map-tooltip";
  root.append(icon, tip);
  return { root, icon, tip };
}

// The marker's DOM lives outside React; these write to it from effects.
function setIcon(parts: MarkerParts, html: string): void {
  parts.icon.innerHTML = html;
}

function setLook(
  parts: MarkerParts,
  zIndex: number,
  tooltipOffset: number,
  draggable: boolean,
): void {
  parts.root.style.zIndex = String(zIndex);
  parts.tip.style.setProperty("--tip-offset", `${tooltipOffset}px`);
  parts.root.classList.toggle("map-marker-draggable", draggable);
}

/** A DOM marker on the MapLibre map, with an optional hover tooltip. */
export function HtmlMarker({
  lon,
  lat,
  html,
  anchor = "center",
  zIndex = 0,
  opacity = 1,
  onClick,
  tooltip,
  tooltipOffset = 14,
  draggable = false,
  onDragEnd,
}: HtmlMarkerProps) {
  const map = useMap();
  const [parts] = useState(createParts);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const clickRef = useRef(onClick);
  const dragRef = useRef(onDragEnd);
  useEffect(() => {
    clickRef.current = onClick;
    dragRef.current = onDragEnd;
  });

  useEffect(() => {
    const marker = new maplibregl.Marker({ element: parts.root, anchor, draggable })
      .setLngLat([lon, lat])
      .addTo(map);
    markerRef.current = marker;
    const click = (e: MouseEvent) => {
      if (!clickRef.current) return;
      e.stopPropagation();
      clickRef.current();
    };
    parts.root.addEventListener("click", click);
    marker.on("dragend", () => {
      const p = marker.getLngLat();
      dragRef.current?.(p.lat, p.lng);
    });
    return () => {
      parts.root.removeEventListener("click", click);
      marker.remove();
      markerRef.current = null;
    };
    // Position updates go through setLngLat below; the marker is made once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, parts, anchor, draggable]);

  useEffect(() => {
    markerRef.current?.setLngLat([lon, lat]);
  }, [lon, lat]);

  useEffect(() => {
    setIcon(parts, html);
  }, [html, parts]);

  useEffect(() => {
    setLook(parts, zIndex, tooltipOffset, draggable);
  }, [zIndex, tooltipOffset, draggable, parts]);

  useEffect(() => {
    // The marker owns the element's opacity style, so go through it.
    markerRef.current?.setOpacity(String(opacity));
  }, [opacity, map, parts, anchor, draggable]);

  return tooltip ? createPortal(tooltip, parts.tip) : null;
}
