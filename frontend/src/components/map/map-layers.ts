import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";

/** Overlays from bottom to top; each group's layers are named "<prefix>-...". */
const OVERLAY_ORDER = [
  "app-choropleth",
  "app-routes",
  "app-faskes",
  "app-if",
  "app-depot",
  "app-floods",
  "app-vehicles",
];

/**
 * Where to insert a group's layers so the stack keeps OVERLAY_ORDER, whatever order
 * the groups are added in. Areas and routes also stay under the basemap's labels.
 */
export function beforeIdFor(map: MapLibreMap, prefix: string): string | undefined {
  const higher = OVERLAY_ORDER.slice(OVERLAY_ORDER.indexOf(prefix) + 1);
  const layers = map.getStyle().layers;
  const above = layers.find((l) => higher.some((h) => l.id.startsWith(`${h}-`)));
  if (above) return above.id;
  if (prefix === "app-choropleth" || prefix === "app-routes") {
    return layers.find((l) => l.type === "symbol")?.id;
  }
  return undefined;
}

/** Removes an overlay's layers and source, if the map still has a style. */
export function removeOverlay(map: MapLibreMap, layerIds: string[], sourceId: string): void {
  if (!map.style) return;
  for (const id of layerIds) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

export function geojsonSource(map: MapLibreMap, id: string): GeoJSONSource | undefined {
  return map.getSource(id) as GeoJSONSource | undefined;
}

/** Signature of a point set: the ids, in order. Same signature, same points. */
export function idSignature(items: { id: string }[]): string {
  return items.map((i) => i.id).join("|");
}

const FADE_OUT_MS = 160;
const POP_IN_MS = 440;

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
// Overshoots a touch and settles, so new points rise into place.
const easeOutBack = (t: number) => {
  const c = 1.6;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

/**
 * Swaps one set of points for another: the old ones fade out, then the new ones
 * fade in while growing from small, slightly past full size and back.
 * `apply(opacity, scale)` paints a frame; `swap()` puts the new data in place.
 * Returns a cancel function.
 */
export function animateSwap(
  apply: (opacity: number, scale: number) => void,
  swap: () => void,
): () => void {
  let frame = 0;
  let swapped = false;
  const start = performance.now();
  const step = (now: number) => {
    const t = now - start;
    if (t < FADE_OUT_MS) {
      const k = easeOut(t / FADE_OUT_MS);
      apply(1 - k, 1 - 0.15 * k);
    } else {
      if (!swapped) {
        swapped = true;
        swap();
      }
      const k = Math.min(1, (t - FADE_OUT_MS) / POP_IN_MS);
      apply(easeOut(k), 0.4 + 0.6 * easeOutBack(k));
      if (k >= 1) return;
    }
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => {
    cancelAnimationFrame(frame);
    if (!swapped) swap();
    apply(1, 1);
  };
}
