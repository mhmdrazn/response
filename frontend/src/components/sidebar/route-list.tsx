"use client";

import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
  EyeOff,
} from "lucide-react";
import { useMemo, useState } from "react";

import { formatDuration, formatLiters, formatMeters, formatNumber } from "../../lib/format-metrics";
import { ROUTE_COLORS } from "../../lib/map-constants";
import type { RouteOut } from "../../types";

interface RouteListProps {
  routes: RouteOut[];
  highlightId: string | null;
  onHoverRoute: (id: string | null) => void;
  onFocusRoute: (route: RouteOut) => void;
  hiddenVehicleIds?: Set<string>;
  onToggleVehicleVisibility?: (vehicleId: string) => void;
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
  hiddenVehicleIds,
  onToggleVehicleVisibility,
}: RouteListProps) {
  const [expandedVehicles, setExpandedVehicles] = useState<Set<string>>(new Set());
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

  const allExpanded = routes.length > 0 && expandedVehicles.size === routes.length;

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

  const chipCls =
    "inline-flex cursor-pointer items-center gap-[4px] rounded-sm border border-frost bg-pure-white px-8 py-[4px] text-[10.5px] font-bold tracking-[-0.1px] text-steel transition-colors hover:border-smoke hover:bg-mist";
  const allHidden =
    hiddenVehicleIds != null &&
    routes.length > 0 &&
    routes.every((r) => hiddenVehicleIds.has(r.vehicle_id));

  return (
    <div className="flex flex-col gap-12">
      <div className="flex items-center justify-between gap-8">
        <div className="text-[11px] font-bold uppercase tracking-[0.9px] text-slate">
          Rute per Kendaraan
        </div>
        {routes.length > 0 ? (
          <div className="flex flex-shrink-0 gap-[4px]">
            {onToggleVehicleVisibility ? (
              <button
                type="button"
                onClick={() => {
                  if (allHidden) {
                    routes.forEach((r) => onToggleVehicleVisibility(r.vehicle_id));
                  } else {
                    routes.forEach((r) => {
                      if (!hiddenVehicleIds?.has(r.vehicle_id))
                        onToggleVehicleVisibility(r.vehicle_id);
                    });
                  }
                }}
                title="Tampil/sembunyikan semua rute"
                className={chipCls}
              >
                {allHidden ? <Eye size={12} strokeWidth={2} /> : <EyeOff size={12} strokeWidth={2} />}
                {allHidden ? "Tampil" : "Sembunyi"}
              </button>
            ) : null}
            <button type="button" onClick={toggleAll} className={chipCls}>
              {allExpanded ? (
                <ChevronsDownUp size={13} strokeWidth={2} />
              ) : (
                <ChevronsUpDown size={13} strokeWidth={2} />
              )}
              {allExpanded ? "Tutup" : "Buka"}
            </button>
          </div>
        ) : null}
      </div>

      {groups.map((group) => {
        const isDepotCollapsed = collapsedDepots.has(group.depotId);
        return (
          <div key={group.depotId} className="flex flex-col gap-[6px]">
            {/* Depot group header */}
            <button
              type="button"
              onClick={() => toggleDepot(group.depotId)}
              className="font-manrope flex cursor-pointer items-center gap-[6px] rounded-md border-0 bg-periwinkle-wash px-8 py-[6px] text-left"
            >
              {isDepotCollapsed ? (
                <ChevronRight size={13} color="var(--color-steel)" />
              ) : (
                <ChevronDown size={13} color="var(--color-steel)" />
              )}
              <span
                className="h-8 w-8 flex-shrink-0 rounded-full bg-[#f59e0b]"
                aria-hidden
              />
              <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px] font-bold text-midnight-ink">
                {group.depotName}
              </span>
              <span className="flex-shrink-0 text-[11px] font-semibold text-slate">
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
                    isHidden={hiddenVehicleIds?.has(r.vehicle_id) ?? false}
                    onToggle={() => toggleVehicle(r.vehicle_id)}
                    onHoverRoute={onHoverRoute}
                    onFocusRoute={onFocusRoute}
                    onToggleVisibility={
                      onToggleVehicleVisibility
                        ? () => onToggleVehicleVisibility(r.vehicle_id)
                        : undefined
                    }
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
  isHidden,
  onToggle,
  onHoverRoute,
  onFocusRoute,
  onToggleVisibility,
}: {
  route: RouteOut;
  isOpen: boolean;
  isActive: boolean;
  isHidden: boolean;
  onToggle: () => void;
  onHoverRoute: (id: string | null) => void;
  onFocusRoute: (route: RouteOut) => void;
  onToggleVisibility?: () => void;
}) {
  const color = ROUTE_COLORS[r.route_color_index % ROUTE_COLORS.length];
  const capLabel = r.capacity_l >= 1000 ? `${r.capacity_l / 1000}K` : `${r.capacity_l}`;

  return (
    <div
      onMouseEnter={() => onHoverRoute(r.vehicle_id)}
      onMouseLeave={() => onHoverRoute(null)}
      className={`ml-12 overflow-hidden rounded-md border transition-[border-color,background,opacity] duration-[140ms] ${
        isActive ? "bg-mist" : "bg-pure-white"
      } ${isHidden ? "opacity-[0.55]" : "opacity-100"}`}
      style={{ borderColor: isActive ? color : "var(--color-frost)" }}
    >
      <div className="flex items-center gap-[4px]">
        <button
          type="button"
          onClick={() => {
            onToggle();
            if (!isHidden) onFocusRoute(r);
          }}
          className="font-manrope flex min-h-[38px] flex-1 cursor-pointer items-center gap-8 border-0 bg-transparent px-[10px] py-8 text-left"
        >
          <span
            aria-hidden
            className="h-[10px] w-[10px] flex-shrink-0 rounded-full"
            style={{ background: color }}
          />
          <span className="flex-shrink-0 text-[13px] font-bold text-midnight-ink">
            {capLabel} L
          </span>
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold text-steel">
            {r.visit_count_flood} genangan · {formatMeters(r.total_distance_m)}
          </span>
          {isOpen ? (
            <ChevronDown size={14} color="var(--color-slate)" />
          ) : (
            <ChevronRight size={14} color="var(--color-slate)" />
          )}
        </button>
        {onToggleVisibility ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility();
            }}
            title={isHidden ? "Tampilkan rute" : "Sembunyikan rute"}
            aria-label={isHidden ? "Tampilkan rute" : "Sembunyikan rute"}
            className={`mr-[6px] inline-flex h-[28px] w-[28px] flex-shrink-0 cursor-pointer items-center justify-center rounded-sm border border-frost ${
              isHidden ? "bg-mist" : "bg-pure-white"
            }`}
          >
            {isHidden ? (
              <EyeOff size={13} strokeWidth={2} color="var(--color-slate)" />
            ) : (
              <Eye size={13} strokeWidth={2} color={color} />
            )}
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <div className="flex flex-col gap-[6px] border-t border-frost px-[10px] pb-[10px]">
          <div className="mt-8 grid grid-cols-2 gap-[6px]">
            <Kv label="Kapasitas" value={formatLiters(r.capacity_l)} />
            <Kv label="Jarak" value={formatMeters(r.total_distance_m)} />
            <Kv label="Waktu" value={formatDuration(r.total_time_s)} />
            <Kv label="Skor" value={formatNumber(r.z_contribution, 0)} />
          </div>
          <div className="mt-[4px] text-[11px] font-bold uppercase tracking-[0.7px] text-slate">
            Urutan Kunjungan
          </div>
          <ol className="m-0 flex list-none flex-col gap-[2px] p-0">
            {r.visits.map((v, i) => (
              <li
                key={i}
                className={`flex items-center gap-[6px] py-[3px] text-[12.5px] ${
                  i < r.visits.length - 1 ? "border-b border-dashed border-frost" : ""
                }`}
              >
                <VisitDot type={v.node_type} />
                <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-bold text-midnight-ink">
                  {v.node_name}
                </span>
                {v.node_type === "flood" ? (
                  <span className="flex-shrink-0 text-[11px] font-medium text-steel">
                    {formatLiters(v.volume_pumped_l)}
                  </span>
                ) : null}
                <span className="flex-shrink-0 text-[11px] font-semibold text-slate tabular-nums">
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
    <div className="flex flex-col gap-[2px] rounded-sm bg-mist px-8 py-[6px]">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.6px] text-slate">{label}</span>
      <span className="text-[13.5px] font-bold text-midnight-ink tabular-nums">{value}</span>
    </div>
  );
}

function VisitDot({ type }: { type: "depot" | "flood" | "if" }) {
  const map: Record<string, string> = {
    depot: "#f59e0b",
    flood: "#ef4444",
    if: "#0284c7",
  };
  return (
    <span
      aria-hidden
      className="h-[6px] w-[6px] flex-shrink-0 rounded-full"
      style={{ background: map[type] }}
    />
  );
}
