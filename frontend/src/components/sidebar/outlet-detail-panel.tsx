"use client";

import { Droplets } from "lucide-react";

import { summarizeIf } from "../../lib/facility-activity";
import { formatDuration, formatMeters, formatNumber } from "../../lib/format-metrics";
import { FACILITY_COLORS, ROUTE_COLORS } from "../../lib/map-constants";
import { localizeHighway, localizeWaterway } from "../../lib/osm-labels";
import type { IntermediateFacility, OptimizationResult } from "../../types";
import {
  DetailColumns,
  DetailFact,
  DetailFacts,
  DetailMark,
  DetailNote,
  DetailSection,
  DetailShell,
  DetailStat,
  DetailStats,
  LOG_ROW_CLS,
  LogHead,
  LogList,
  LogRows,
} from "./detail-parts";

interface OutletDetailPanelProps {
  outlet: IntermediateFacility;
  result: OptimizationResult | null;
  onClose: () => void;
  variant?: "fullscreen" | "embedded";
}

const LOG_GRID =
  "grid grid-cols-[10px_minmax(0,0.9fr)_minmax(0,1.5fr)_84px_72px] items-center gap-x-[10px]";

function drainNote(type: string | null): string {
  if (type === "river") return "sungai besar, buang lebih cepat";
  if (type === "stream") return "kali kecil, buang lebih lambat";
  return "memengaruhi waktu buang";
}

export function OutletDetailPanel({
  outlet,
  result,
  onClose,
  variant = "fullscreen",
}: OutletDetailPanelProps) {
  const activity = summarizeIf(result, outlet.id);
  const hasPlan = result !== null;
  const used = activity.discharges.length;
  const first = activity.discharges[0];
  const last = activity.discharges[used - 1];
  const title = outlet.waterway_name ?? outlet.highway_name ?? `Titik Buang Air ${outlet.id}`;

  const status = !hasPlan
    ? { label: "Belum ada rencana", cls: "bg-periwinkle-wash text-steel" }
    : used > 0
      ? { label: `${used} pembuangan`, cls: "bg-[#f0fdf4] text-[#15803d]" }
      : { label: "Tidak dipakai", cls: "bg-[#fffbeb] text-[#b45309]" };

  return (
    <DetailShell
      label={`Detail titik buang air ${title}`}
      closeLabel="Tutup detail titik buang air"
      onClose={onClose}
      variant={variant}
      mark={
        <DetailMark color={FACILITY_COLORS.if}>
          <Droplets size={14} strokeWidth={2.2} />
        </DetailMark>
      }
      title={title}
      badge={status}
      subtitle={
        outlet.highway_name && outlet.highway_name !== title
          ? `Titik buang air · ${outlet.highway_name}`
          : "Titik buang air (fasilitas perantara)"
      }
    >
      <DetailStats>
        <DetailStat
          label="Pembuangan"
          value={hasPlan ? formatNumber(used) : "-"}
          sub={hasPlan ? `oleh ${activity.vehicleCount} kendaraan` : "belum ada rencana"}
        />
        <DetailStat
          label="Volume dibuang"
          value={hasPlan ? `${formatNumber(activity.dischargedL)} L` : "-"}
          sub={hasPlan ? "total semua kendaraan" : "belum ada rencana"}
        />
        <DetailStat
          label="Pertama dipakai"
          value={first ? formatDuration(first.arrivalS) : "-"}
          sub={
            last && last !== first
              ? `terakhir ${formatDuration(last.arrivalS)}`
              : "sejak armada berangkat"
          }
        />
        <DetailStat
          label="Tipe air"
          value={localizeWaterway(outlet.waterway_type) ?? "-"}
          sub={drainNote(outlet.waterway_type)}
          last
        />
      </DetailStats>

      <DetailColumns>
        <DetailSection title="Lokasi & kondisi">
          <DetailFacts>
            <DetailFact label="ID" value={outlet.id} />
            <DetailFact label="Sungai" value={outlet.waterway_name ?? "-"} />
            <DetailFact label="Tipe air" value={localizeWaterway(outlet.waterway_type) ?? "-"} />
            <DetailFact label="Jalan" value={outlet.highway_name ?? "-"} />
            <DetailFact label="Kelas jalan" value={localizeHighway(outlet.highway_type) ?? "-"} />
            <DetailFact
              label="Jarak ke air"
              value={
                outlet.distance_to_water_m != null ? formatMeters(outlet.distance_to_water_m) : "-"
              }
            />
            <DetailFact
              label="Titik sumber OSM"
              value={outlet.n_source_points != null ? formatNumber(outlet.n_source_points) : "-"}
            />
            <DetailFact
              label="Koordinat"
              value={`${outlet.lat.toFixed(5)}, ${outlet.lon.toFixed(5)}`}
            />
          </DetailFacts>
        </DetailSection>

        <DetailSection title="Log pembuangan" fill>
          {!hasPlan ? (
            <DetailNote>
              Belum ada rencana rute. Jalankan optimasi untuk melihat kendaraan yang membuang air
              di titik ini.
            </DetailNote>
          ) : used === 0 ? (
            <DetailNote>
              Tidak ada kendaraan yang membuang air di titik ini pada rencana saat ini.
            </DetailNote>
          ) : (
            <LogList>
              <LogHead grid={LOG_GRID}>
                <span aria-hidden />
                <span>Kendaraan</span>
                <span>Depo</span>
                <span className="text-right">Tiba</span>
                <span className="text-right">Volume</span>
              </LogHead>
              <LogRows>
                {activity.discharges.map((d, i) => (
                  <li key={`${d.vehicleId}-${i}`} className={`${LOG_GRID} ${LOG_ROW_CLS}`}>
                    <span
                      aria-hidden
                      className="inline-block h-[10px] w-[10px] rounded-full"
                      style={{ background: ROUTE_COLORS[d.colorIndex % ROUTE_COLORS.length] }}
                    />
                    <span className="truncate font-bold text-midnight-ink">{d.vehicleId}</span>
                    <span className="truncate font-medium text-slate" title={d.depotName}>
                      {d.depotName}
                    </span>
                    <span className="text-right font-bold tabular-nums text-midnight-ink">
                      {formatDuration(d.arrivalS)}
                    </span>
                    <span className="text-right font-medium tabular-nums text-steel">
                      {formatNumber(d.dischargedL)} L
                    </span>
                  </li>
                ))}
              </LogRows>
            </LogList>
          )}
        </DetailSection>
      </DetailColumns>
    </DetailShell>
  );
}
