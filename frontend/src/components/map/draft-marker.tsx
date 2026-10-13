"use client";

import { HtmlMarker } from "./html-marker";

interface DraftMarkerProps {
  lat: number;
  lon: number;
  onMove: (lat: number, lon: number) => void;
}

const PIN_HTML = `
  <div class="soft-pop" style="position:relative;width:30px;height:40px;">
    <svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 1C7.3 1 1 7.2 1 14.8c0 10.2 14 24.2 14 24.2s14-14 14-24.2C29 7.2 22.7 1 15 1z"
            fill="var(--color-indigo-ink)" stroke="#ffffff" stroke-width="2"/>
      <circle cx="15" cy="15" r="5.2" fill="#ffffff"/>
    </svg>
  </div>`;

/** A pin for the point being added; it can be dragged to fine-tune the spot. */
export function DraftMarker({ lat, lon, onMove }: DraftMarkerProps) {
  return (
    <HtmlMarker
      lon={lon}
      lat={lat}
      html={PIN_HTML}
      anchor="bottom"
      zIndex={20}
      draggable
      onDragEnd={onMove}
    />
  );
}
