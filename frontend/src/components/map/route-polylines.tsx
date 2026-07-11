"use client";

import { Polyline, Tooltip } from "react-leaflet";

import { ROUTE_COLORS } from "../../lib/map-constants";
import { formatDuration, formatMeters } from "../../lib/format-metrics";
import type { RouteOut } from "../../types";

interface RoutePolylinesProps {
  routes: RouteOut[];
  highlightId: string | null;
  onHover: (vehicleId: string | null) => void;
}

export function RoutePolylines({
  routes,
  highlightId,
  onHover,
}: RoutePolylinesProps) {
  return (
    <>
      {routes.map((r) => {
        const active = highlightId === r.vehicle_id;
        const color = ROUTE_COLORS[r.route_color_index % ROUTE_COLORS.length];
        return (
          <Polyline
            key={r.vehicle_id}
            positions={r.polyline as [number, number][]}
            pathOptions={{
              color,
              weight: active ? 6 : 4,
              opacity: highlightId && !active ? 0.35 : 0.9,
              lineCap: "round",
              lineJoin: "round",
            }}
            eventHandlers={{
              mouseover: () => onHover(r.vehicle_id),
              mouseout: () => onHover(null),
            }}
          >
            <Tooltip sticky direction="top" opacity={1}>
              <div style={{ maxWidth: 230, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: "var(--font-weight-bold)",
                    color,
                    letterSpacing: "-0.13px",
                  }}
                >
                  Kendaraan {r.vehicle_id}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: "var(--font-weight-semibold)",
                    color: "var(--color-slate)",
                    marginBottom: 4,
                  }}
                >
                  {r.depot_name || r.depot_id} · {r.capacity_l.toLocaleString()} L
                </div>
                <div style={{ fontSize: 12, color: "var(--color-midnight-ink)" }}>
                  {r.visit_count_flood} titik genangan · {r.visit_count_if} sungai
                  <br />
                  {formatMeters(r.total_distance_m)} ·{" "}
                  {formatDuration(r.total_time_s)}
                </div>
              </div>
            </Tooltip>
          </Polyline>
        );
      })}
    </>
  );
}
