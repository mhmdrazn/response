"use client";

import { Droplets, Truck, Warehouse, Waves, type LucideIcon } from "lucide-react";

import { formatDuration, formatMeters, formatNumber } from "../../lib/format-metrics";
import { FACILITY_COLORS, ROUTE_COLORS } from "../../lib/map-constants";
import type { MapSelection, NodeType, RouteOut, VisitOut } from "../../types";
import {
  DetailColumns,
  DetailFact,
  DetailFacts,
  DetailMark,
  DetailSection,
  DetailShell,
  DetailStat,
  DetailStats,
  LOG_ROW_CLS,
  LogHead,
  LogList,
  LogRows,
} from "./detail-parts";

interface RouteDetailPanelProps {
  route: RouteOut;
  /** Objective Z of the whole plan, to show this route's share of it. */
  objectiveZ: number;
  /** Open the detail of a stop on the route. */
  onSelectStop: (selection: MapSelection) => void;
  onClose: () => void;
  variant?: "fullscreen" | "embedded";
}

const LOG_GRID = "grid grid-cols-[22px_14px_minmax(0,1fr)_84px_92px] items-center gap-x-[8px]";

const STOP_ICON: Record<NodeType, { Icon: LucideIcon; color: string }> = {
  depot: { Icon: Warehouse, color: FACILITY_COLORS.depot },
  flood: { Icon: Waves, color: "var(--color-steel)" },
  if: { Icon: Droplets, color: FACILITY_COLORS.if },
};

/** Litres moved at a stop: pumped at a flood, poured out at an outlet. */
function stopVolume(route: RouteOut, index: number): string {
  const v: VisitOut = route.visits[index];
  if (v.node_type === "flood") return `+${formatNumber(v.volume_pumped_l)} L`;
  if (v.node_type === "if") {
    const poured = index > 0 ? route.visits[index - 1].tank_load_after_l : route.capacity_l;
    return `−${formatNumber(poured)} L`;
  }
  return "-";
}

export function RouteDetailPanel({
  route,
  objectiveZ,
  onSelectStop,
  onClose,
  variant = "fullscreen",
}: RouteDetailPanelProps) {
  const color = ROUTE_COLORS[route.route_color_index % ROUTE_COLORS.length];
  const floodStops = route.visits.filter((v) => v.node_type === "flood");
  const pumpedL = floodStops.reduce((s, v) => s + v.volume_pumped_l, 0);
  const distinctFloods = new Set(floodStops.filter((v) => v.volume_pumped_l > 0).map((v) => v.node_id))
    .size;
  const share = objectiveZ > 0 ? (route.z_contribution / objectiveZ) * 100 : null;

  return (
    <DetailShell
      label={`Detail rute ${route.vehicle_id}`}
      closeLabel="Tutup detail rute"
      onClose={onClose}
      variant={variant}
      mark={
        <DetailMark color={color}>
          <Truck size={14} strokeWidth={2.2} />
        </DetailMark>
      }
      title={`Kendaraan ${route.vehicle_id}`}
      badge={{ label: `Tangki ${formatNumber(route.capacity_l)} L`, cls: "bg-periwinkle-wash text-steel" }}
      subtitle={route.depot_name || route.depot_id}
    >
      <DetailStats>
        <DetailStat
          label="Total waktu"
          value={formatDuration(route.total_time_s)}
          sub="sejak berangkat dari depo"
        />
        <DetailStat
          label="Jarak tempuh"
          value={formatMeters(route.total_distance_m)}
          sub={`${formatNumber(route.visits.length)} perhentian`}
        />
        <DetailStat
          label="Volume dipompa"
          value={`${formatNumber(pumpedL)} L`}
          sub={`di ${formatNumber(distinctFloods)} genangan`}
        />
        <DetailStat
          label="Kontribusi Z"
          value={formatNumber(route.z_contribution)}
          sub={share != null ? `${formatNumber(share, 1)}% dari total` : "bagian dari objektif"}
          last
        />
      </DetailStats>

      <DetailColumns>
        <DetailSection title="Ringkasan rute">
          <DetailFacts>
            <DetailFact label="Depo asal" value={route.depot_name || route.depot_id} />
            <DetailFact label="Kapasitas tangki" value={`${formatNumber(route.capacity_l)} L`} />
            <DetailFact label="Kunjungan genangan" value={formatNumber(route.visit_count_flood)} />
            <DetailFact label="Pembuangan air" value={formatNumber(route.visit_count_if)} />
            <DetailFact label="Genangan berbeda" value={formatNumber(distinctFloods)} />
            <DetailFact
              label="Warna di peta"
              value={
                <span
                  aria-hidden
                  className="inline-block h-[10px] w-[28px] rounded-full align-middle"
                  style={{ background: color }}
                />
              }
            />
          </DetailFacts>
        </DetailSection>

        <DetailSection title="Urutan kunjungan" fill>
          <LogList>
            <LogHead grid={LOG_GRID}>
              <span className="text-right">#</span>
              <span aria-hidden />
              <span>Perhentian</span>
              <span className="text-right">Tiba</span>
              <span className="text-right">Volume</span>
            </LogHead>
            <LogRows>
              {route.visits.map((v, i) => {
                const { Icon, color: iconColor } = STOP_ICON[v.node_type];
                return (
                  <li key={`${v.node_id}-${i}`} className="border-b border-frost last:border-b-0">
                    <button
                      type="button"
                      onClick={() => onSelectStop({ kind: v.node_type, id: v.node_id })}
                      title="Buka detail perhentian ini"
                      className={`${LOG_GRID} ${LOG_ROW_CLS} w-full cursor-pointer border-0 bg-transparent px-0 text-left transition-colors hover:bg-mist`}
                    >
                      <span className="text-right font-medium tabular-nums text-slate">{i + 1}</span>
                      <Icon size={13} strokeWidth={2.2} color={iconColor} aria-hidden />
                      <span className="truncate font-bold text-midnight-ink" title={v.node_name}>
                        {v.node_name}
                      </span>
                      <span className="text-right font-bold tabular-nums text-midnight-ink">
                        {formatDuration(v.arrival_time_s)}
                      </span>
                      <span className="text-right font-medium tabular-nums text-steel">
                        {stopVolume(route, i)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </LogRows>
          </LogList>
        </DetailSection>
      </DetailColumns>
    </DetailShell>
  );
}
