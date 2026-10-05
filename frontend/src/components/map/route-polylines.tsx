"use client";

import { Polyline, Tooltip } from "react-leaflet";

import { ROUTE_COLORS } from "../../lib/map-constants";
import { formatDuration, formatMeters } from "../../lib/format-metrics";
import type { RouteOut } from "../../types";

interface RoutePolylinesProps {
  routes: RouteOut[];
  highlightId: string | null;
  /** Route whose detail panel is open; drawn thicker. */
  selectedId?: string | null;
  onHover: (vehicleId: string | null) => void;
  onSelect?: (vehicleId: string) => void;
}

export function RoutePolylines({
  routes,
  highlightId,
  selectedId,
  onHover,
  onSelect,
}: RoutePolylinesProps) {
  return (
    <>
      {routes.map((r) => {
        const active = highlightId === r.vehicle_id || selectedId === r.vehicle_id;
        const color = ROUTE_COLORS[r.route_color_index % ROUTE_COLORS.length];
        return (
          <Polyline
            key={r.vehicle_id}
            positions={r.polyline as [number, number][]}
            pathOptions={{
              color,
              weight: active ? 6 : 4,
              opacity: (highlightId || selectedId) && !active ? 0.35 : 0.9,
              lineCap: "round",
              lineJoin: "round",
            }}
            eventHandlers={{
              mouseover: () => onHover(r.vehicle_id),
              mouseout: () => onHover(null),
              click: () => onSelect?.(r.vehicle_id),
            }}
          >
            <Tooltip sticky direction="top" opacity={1}>
              <div className="min-w-0 max-w-[230px]">
                <div className="flex items-center gap-[6px] text-[13px] font-bold tracking-[-0.13px] text-midnight-ink">
                  <span
                    aria-hidden
                    className="inline-block h-[10px] w-[10px] flex-shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                  Kendaraan {r.vehicle_id}
                </div>
                <div className="mb-[4px] text-[11px] font-semibold text-slate">
                  {r.depot_name || r.depot_id} · {r.capacity_l.toLocaleString()} L
                </div>
                <div className="text-[12px] text-midnight-ink">
                  {r.visit_count_flood} titik genangan · {r.visit_count_if} sungai
                  <br />
                  {formatMeters(r.total_distance_m)} · {formatDuration(r.total_time_s)}
                </div>
                <div className="mt-[3px] text-[10.5px] font-medium text-slate">
                  Klik untuk detail lengkap
                </div>
              </div>
            </Tooltip>
          </Polyline>
        );
      })}
    </>
  );
}
