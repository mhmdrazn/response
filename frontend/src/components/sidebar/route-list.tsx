"use client";

import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";

import {
  formatDuration,
  formatLiters,
  formatMeters,
  formatNumber,
} from "../../lib/format-metrics";
import { ROUTE_COLORS } from "../../lib/map-constants";
import type { RouteOut } from "../../types";

interface RouteListProps {
  routes: RouteOut[];
  highlightId: string | null;
  onHoverRoute: (id: string | null) => void;
  onFocusRoute: (route: RouteOut) => void;
}

interface DepotGroup {
  depotId: string;
  depotName: string;
  routes: RouteOut[];
}

export function RouteList({
  routes,
  highlightId,
  onHoverRoute,
  onFocusRoute,
}: RouteListProps) {
  const [expandedVehicles, setExpandedVehicles] = useState<Set<string>>(
    new Set(),
  );
  const [collapsedDepots, setCollapsedDepots] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const map = new Map<string, DepotGroup>();
    for (const r of routes) {
      const key = r.depot_id;
      if (!map.has(key)) {
        map.set(key, {
          depotId: r.depot_id,
          depotName: r.depot_name || r.depot_id,
          routes: [],
        });
      }
      map.get(key)!.routes.push(r);
    }
    return Array.from(map.values());
  }, [routes]);

  const allExpanded =
    routes.length > 0 && expandedVehicles.size === routes.length;

  function toggleDepot(depotId: string) {
    setCollapsedDepots((prev) => {
      const next = new Set(prev);
      if (next.has(depotId)) next.delete(depotId);
      else next.add(depotId);
      return next;
    });
  }

  function toggleVehicle(vehicleId: string) {
    setExpandedVehicles((prev) => {
      const next = new Set(prev);
      if (next.has(vehicleId)) next.delete(vehicleId);
      else next.add(vehicleId);
      return next;
    });
  }

  function toggleAll() {
    if (allExpanded) {
      setExpandedVehicles(new Set());
    } else {
      // Expand every route card and reveal any collapsed depot groups.
      setExpandedVehicles(new Set(routes.map((r) => r.vehicle_id)));
      setCollapsedDepots(new Set());
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.9px",
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-slate)",
          }}
        >
          Rute per Kendaraan
        </div>
        {routes.length > 0 ? (
          <button
            type="button"
            onClick={toggleAll}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 8px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-frost)",
              background: "var(--color-pure-white)",
              color: "var(--color-indigo-ink)",
              fontSize: 10.5,
              fontWeight: "var(--font-weight-bold)",
              letterSpacing: "-0.1px",
              cursor: "pointer",
              flexShrink: 0,
              transition: "background 0.15s ease, border-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--color-mist)";
              e.currentTarget.style.borderColor = "var(--color-smoke)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--color-pure-white)";
              e.currentTarget.style.borderColor = "var(--color-frost)";
            }}
          >
            {allExpanded ? (
              <ChevronsDownUp size={13} strokeWidth={2} />
            ) : (
              <ChevronsUpDown size={13} strokeWidth={2} />
            )}
            {allExpanded ? "Tutup Semua" : "Buka Semua"}
          </button>
        ) : null}
      </div>

      {groups.map((group) => {
        const isDepotCollapsed = collapsedDepots.has(group.depotId);
        return (
          <div
            key={group.depotId}
            style={{ display: "flex", flexDirection: "column", gap: 6 }}
          >
            {/* Depot group header */}
            <button
              type="button"
              onClick={() => toggleDepot(group.depotId)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 8px",
                background: "var(--color-periwinkle-wash)",
                border: "none",
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
                fontFamily: "var(--font-manrope)",
                textAlign: "left",
              }}
            >
              {isDepotCollapsed ? (
                <ChevronRight size={13} color="var(--color-indigo-ink)" />
              ) : (
                <ChevronDown size={13} color="var(--color-indigo-ink)" />
              )}
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: "#533afd",
                  flexShrink: 0,
                }}
                aria-hidden
              />
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: "var(--font-weight-bold)",
                  color: "var(--color-indigo-ink)",
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {group.depotName}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: "var(--font-weight-semibold)",
                  color: "var(--color-slate)",
                  flexShrink: 0,
                }}
              >
                {group.routes.length} unit
              </span>
            </button>

            {/* Routes under this depot */}
            {!isDepotCollapsed
              ? group.routes.map((r) => (
                  <RouteCard
                    key={r.vehicle_id}
                    route={r}
                    isOpen={expandedVehicles.has(r.vehicle_id)}
                    isActive={highlightId === r.vehicle_id}
                    onToggle={() => toggleVehicle(r.vehicle_id)}
                    onHoverRoute={onHoverRoute}
                    onFocusRoute={onFocusRoute}
                  />
                ))
              : null}
          </div>
        );
      })}
    </div>
  );
}

function RouteCard({
  route: r,
  isOpen,
  isActive,
  onToggle,
  onHoverRoute,
  onFocusRoute,
}: {
  route: RouteOut;
  isOpen: boolean;
  isActive: boolean;
  onToggle: () => void;
  onHoverRoute: (id: string | null) => void;
  onFocusRoute: (route: RouteOut) => void;
}) {
  const color = ROUTE_COLORS[r.route_color_index % ROUTE_COLORS.length];
  const capLabel = r.capacity_l >= 1000 ? `${r.capacity_l / 1000}K` : `${r.capacity_l}`;

  return (
    <div
      onMouseEnter={() => onHoverRoute(r.vehicle_id)}
      onMouseLeave={() => onHoverRoute(null)}
      style={{
        border: "1px solid",
        borderColor: isActive ? color : "var(--color-frost)",
        borderRadius: "var(--radius-md)",
        background: isActive ? "var(--color-mist)" : "var(--color-pure-white)",
        overflow: "hidden",
        transition: "border-color 0.14s ease, background 0.14s ease",
        marginLeft: 12,
      }}
    >
      <button
        type="button"
        onClick={() => {
          onToggle();
          onFocusRoute(r);
        }}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          minHeight: 38,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "var(--font-manrope)",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: color,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-midnight-ink)",
            flexShrink: 0,
          }}
        >
          {capLabel} L
        </span>
        <span
          style={{
            fontSize: 12,
            color: "var(--color-steel)",
            fontWeight: "var(--font-weight-semibold)",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {r.visit_count_flood} genangan · {formatMeters(r.total_distance_m)}
        </span>
        {isOpen ? (
          <ChevronDown size={14} color="var(--color-slate)" />
        ) : (
          <ChevronRight size={14} color="var(--color-slate)" />
        )}
      </button>

      {isOpen ? (
        <div
          style={{
            padding: "0 10px 10px",
            borderTop: "1px solid var(--color-frost)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 6,
              marginTop: 8,
            }}
          >
            <Kv label="Kapasitas" value={formatLiters(r.capacity_l)} />
            <Kv label="Jarak" value={formatMeters(r.total_distance_m)} />
            <Kv label="Waktu" value={formatDuration(r.total_time_s)} />
            <Kv label="Skor" value={formatNumber(r.z_contribution, 0)} />
          </div>
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.7px",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-slate)",
              marginTop: 4,
            }}
          >
            Urutan Kunjungan
          </div>
          <ol
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {r.visits.map((v, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12.5,
                  padding: "3px 0",
                  borderBottom:
                    i < r.visits.length - 1
                      ? "1px dashed var(--color-frost)"
                      : "none",
                }}
              >
                <VisitDot type={v.node_type} />
                <span
                  style={{
                    fontWeight: "var(--font-weight-bold)",
                    color: "var(--color-midnight-ink)",
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {v.node_name}
                </span>
                {v.node_type === "flood" ? (
                  <span
                    style={{
                      color: "var(--color-steel)",
                      fontWeight: "var(--font-weight-medium)",
                      fontSize: 11,
                      flexShrink: 0,
                    }}
                  >
                    {formatLiters(v.volume_pumped_l)}
                  </span>
                ) : null}
                <span
                  style={{
                    color: "var(--color-slate)",
                    fontWeight: "var(--font-weight-semibold)",
                    fontVariantNumeric: "tabular-nums",
                    flexShrink: 0,
                    fontSize: 11,
                  }}
                >
                  {formatDuration(v.arrival_time_s)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "6px 8px",
        background: "var(--color-mist)",
        borderRadius: "var(--radius-sm)",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <span
        style={{
          fontSize: 10.5,
          textTransform: "uppercase",
          letterSpacing: "0.6px",
          color: "var(--color-slate)",
          fontWeight: "var(--font-weight-bold)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13.5,
          color: "var(--color-midnight-ink)",
          fontWeight: "var(--font-weight-bold)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function VisitDot({ type }: { type: "depot" | "flood" | "if" }) {
  const map: Record<string, string> = {
    depot: "#533afd",
    flood: "#ef4444",
    if: "#50617a",
  };
  return (
    <span
      aria-hidden
      style={{
        width: 6,
        height: 6,
        borderRadius: 999,
        background: map[type],
        flexShrink: 0,
      }}
    />
  );
}
