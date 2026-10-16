"use client";

import type { RasterTileSource } from "maplibre-gl";
import { useEffect, useRef } from "react";

import { TRAFFIC_REFRESH_MS, TrafficTilesError, trafficTileUrl } from "../../lib/google-traffic";
import { useMapContext } from "./map-context";
import { beforeIdFor, removeOverlay } from "./map-layers";

export type TrafficStatusState =
  { kind: "loading" } | { kind: "ready"; updatedAt: Date } | { kind: "error"; message: string };

interface TrafficLayerProps {
  onStatus: (status: TrafficStatusState) => void;
}

const SOURCE = "app-traffic";
const LAYER = "app-traffic-raster";

/**
 * Google's live traffic colours over the basemap, under the routes and points.
 * The tile session is renewed every few minutes so the colours keep up.
 */
export function TrafficLayer({ onStatus }: TrafficLayerProps) {
  const { map, styleVersion } = useMapContext();
  const statusRef = useRef(onStatus);
  useEffect(() => {
    statusRef.current = onStatus;
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const url = await trafficTileUrl();
        if (cancelled) return;
        const src = map.getSource(SOURCE) as RasterTileSource | undefined;
        if (src) {
          src.setTiles([url]);
        } else {
          map.addSource(SOURCE, {
            type: "raster",
            tiles: [url],
            tileSize: 256,
            maxzoom: 20,
            attribution: "Lalu lintas © Google",
          });
          map.addLayer(
            {
              id: LAYER,
              type: "raster",
              source: SOURCE,
              paint: { "raster-opacity": 0.9, "raster-fade-duration": 250 },
            },
            beforeIdFor(map, "app-traffic"),
          );
        }
        statusRef.current({ kind: "ready", updatedAt: new Date() });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof TrafficTilesError
            ? err.message
            : "Tile lalu lintas Google tidak bisa dimuat.";
        statusRef.current({ kind: "error", message });
      }
    };
    statusRef.current({ kind: "loading" });
    void load();
    const timer = window.setInterval(load, TRAFFIC_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [map, styleVersion]);

  useEffect(() => () => removeOverlay(map, [LAYER], SOURCE), [map]);

  return null;
}
