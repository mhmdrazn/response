import type { Map as MapLibreMap } from "maplibre-gl";

import { FACILITY_COLORS } from "./map-constants";

// Facility markers are drawn by MapLibre as symbol layers, so they move with the
// map pixel for pixel. Their glyphs are SVG, rasterised once into map images.

export type FacilityKind = "depot" | "if" | "faskes";

/** Glyph size in CSS pixels; the image is drawn at twice that for sharp edges. */
export const FACILITY_ICON_SIZE: Record<FacilityKind, number> = { depot: 24, if: 20, faskes: 18 };

export const facilityIconId = (kind: FacilityKind) => `app-icon-${kind}`;

/** FACILITY_COLORS may name a CSS variable; canvas needs the resolved colour. */
export function facilityColor(kind: FacilityKind): string {
  const c = FACILITY_COLORS[kind];
  const m = /^var\((--[^)]+)\)$/.exec(c);
  if (!m) return c;
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || "#f59e0b";
}

function glyphSvg(kind: FacilityKind, color: string): string {
  const s = FACILITY_ICON_SIZE[kind];
  // 2 px white ring around a coloured body, as the DOM markers had.
  const body =
    kind === "faskes"
      ? `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 2 - 1}" fill="${color}" stroke="#fff" stroke-width="2"/>`
      : `<rect x="1" y="1" width="${s - 2}" height="${s - 2}" rx="6" fill="${color}" stroke="#fff" stroke-width="2"/>`;
  const glyph =
    kind === "depot"
      ? // fire station: pitched roof, body, garage door
        `<g transform="translate(5 5) scale(0.875)">
           <path d="M2 6L8 2L14 6Z" fill="#fff"/>
           <rect x="3" y="6" width="10" height="8" fill="#fff"/>
           <rect x="5.5" y="8.5" width="5" height="5.5" fill="${color}"/>
         </g>`
      : kind === "if"
        ? // water drop
          `<g transform="translate(4.5 4.5) scale(0.6875)">
             <path d="M8 2C5 6 3.5 8 3.5 10.5A4.5 4.5 0 0 0 12.5 10.5C12.5 8 11 6 8 2Z" fill="#fff"/>
           </g>`
        : // cross
          `<g transform="translate(4 4) scale(0.625)">
             <path d="M6.5 3h3v3h3v3h-3v3h-3v-3h-3v-3h3z" fill="#fff"/>
           </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${body}${glyph}</svg>`;
}

const cache = new Map<FacilityKind, Promise<ImageData>>();

function rasterise(kind: FacilityKind): Promise<ImageData> {
  let p = cache.get(kind);
  if (!p) {
    p = new Promise<ImageData>((resolve, reject) => {
      const size = FACILITY_ICON_SIZE[kind] * 2;
      const img = new Image(size, size);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas"));
        ctx.drawImage(img, 0, 0, size, size);
        resolve(ctx.getImageData(0, 0, size, size));
      };
      img.onerror = reject;
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(glyphSvg(kind, facilityColor(kind)))}`;
    });
    cache.set(kind, p);
  }
  return p;
}

/** Adds the facility's icon to the current style if missing (a style switch drops images). */
export async function ensureFacilityIcon(map: MapLibreMap, kind: FacilityKind): Promise<void> {
  const data = await rasterise(kind);
  const id = facilityIconId(kind);
  if (!map.hasImage(id)) map.addImage(id, data, { pixelRatio: 2 });
}
