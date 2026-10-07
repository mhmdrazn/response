"use client";

import { Warehouse } from "lucide-react";

import { summarizeDepot } from "../../lib/facility-activity";
import { formatDuration, formatMeters, formatNumber } from "../../lib/format-metrics";
import { haversineM } from "../../lib/geo";
import { FACILITY_COLORS, ROUTE_COLORS } from "../../lib/map-constants";
import type { Depot, FloodPoint, OptimizationResult } from "../../types";
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

interface DepotDetailPanelProps {
  depot: Depot;
  floods: FloodPoint[];
  result: OptimizationResult | null;
  onClose: () => void;
  variant?: "fullscreen" | "embedded";
}

const LOG_GRID =
  "grid grid-cols-[10px_minmax(0,0.9fr)_64px_56px_80px_72px] items-center gap-x-[10px]";

function nearestFlood(depot: Depot, floods: FloodPoint[]): { index: number; distM: number } | null {
  let best: { index: number; distM: number } | null = null;
  for (let index = 0; index < floods.length; index++) {
    const distM = haversineM(depot, floods[index]);
    if (best === null || distM < best.distM) best = { index, distM };
  }
  return best;
}

export function DepotDetailPanel({
  depot,
  floods,
  result,
  onClose,
  variant = "fullscreen",
}: DepotDetailPanelProps) {
  const activity = summarizeDepot(result, depot.id);
  const hasPlan = result !== null;
  const deployed = activity.fleet.length;
  const nearest = nearestFlood(depot, floods);

  const status = !hasPlan
    ? { label: "Belum ada rencana", cls: "bg-periwinkle-wash text-steel" }
    : deployed > 0
      ? { label: `${deployed} kendaraan dikerahkan`, cls: "bg-[#f0fdf4] text-[#15803d]" }
      : { label: "Tidak dikerahkan", cls: "bg-[#fffbeb] text-[#b45309]" };

  return (
    <DetailShell
      label={`Detail depo ${depot.name ?? depot.id}`}
      closeLabel="Tutup detail depo"
      onClose={onClose}
      variant={variant}
      mark={
        <DetailMark color={FACILITY_COLORS.depot}>
          <Warehouse size={14} strokeWidth={2.2} />
        </DetailMark>
      }
      title={depot.name ?? `Depo ${depot.id}`}
      badge={status}
      subtitle={depot.address?.trim() || "Alamat belum tercatat"}
    >
      <DetailStats>
        <DetailStat
          label="Kendaraan"
          value={hasPlan ? formatNumber(deployed) : "-"}
          sub={hasPlan ? "keluar dari depo ini" : "belum ada rencana"}
        />
        <DetailStat
          label="Genangan dilayani"
          value={hasPlan ? formatNumber(activity.floodCount) : "-"}
          sub={hasPlan ? "titik berbeda" : "belum ada rencana"}
        />
        <DetailStat
          label="Volume dipompa"
          value={hasPlan ? `${formatNumber(activity.pumpedL)} L` : "-"}
          sub={hasPlan ? "total semua kendaraan" : "belum ada rencana"}
        />
        <DetailStat
          label="Rute terlama"
          value={hasPlan && deployed > 0 ? formatDuration(activity.longestS) : "-"}
          sub={
            !hasPlan
              ? "belum ada rencana"
              : deployed > 0
                ? `${formatMeters(activity.distanceM)} total tempuh`
                : "tidak ada rute"
          }
          last
        />
      </DetailStats>

      <DetailColumns>
        <DetailSection title="Lokasi">
          <DetailFacts>
            <DetailFact label="ID" value={depot.id} />
            <DetailFact label="Alamat" value={depot.address?.trim() || "-"} />
            <DetailFact label="Tipe" value={depot.type ?? "-"} />
            <DetailFact
              label="Genangan terdekat"
              value={nearest ? `Genangan ${nearest.index + 1} · ${formatMeters(nearest.distM)}` : "-"}
            />
            <DetailFact
              label="Koordinat"
              value={`${depot.lat.toFixed(5)}, ${depot.lon.toFixed(5)}`}
            />
          </DetailFacts>
          <DetailNote>Jarak ke genangan terdekat dihitung garis lurus.</DetailNote>
        </DetailSection>

        <DetailSection title="Armada dari depo ini" fill>
          {!hasPlan ? (
            <DetailNote>
              Belum ada rencana rute. Jalankan optimasi untuk melihat kendaraan yang berangkat dari
              depo ini.
            </DetailNote>
          ) : deployed === 0 ? (
            <DetailNote>
              Tidak ada kendaraan dari depo ini yang dikerahkan pada rencana saat ini. Genangan
              dalam jangkauan depo ini dilayani depo lain.
            </DetailNote>
          ) : (
            <LogList>
              <LogHead grid={LOG_GRID}>
                <span aria-hidden />
                <span>Kendaraan</span>
                <span className="text-right">Tangki</span>
                <span className="text-right">Titik</span>
                <span className="text-right">Waktu</span>
                <span className="text-right">Volume</span>
              </LogHead>
              <LogRows>
                {activity.fleet.map((v) => (
                  <li key={v.vehicleId} className={`${LOG_GRID} ${LOG_ROW_CLS}`}>
                    <span
                      aria-hidden
                      className="inline-block h-[10px] w-[10px] rounded-full"
                      style={{ background: ROUTE_COLORS[v.colorIndex % ROUTE_COLORS.length] }}
                    />
                    <span className="truncate font-bold text-midnight-ink">{v.vehicleId}</span>
                    <span className="text-right font-medium tabular-nums text-slate">
                      {formatNumber(v.capacityL / 1000)} kL
                    </span>
                    <span
                      className="text-right font-medium tabular-nums text-slate"
                      title={`${v.floodVisits} kunjungan genangan, ${v.ifVisits} pembuangan`}
                    >
                      {v.floodVisits}+{v.ifVisits}
                    </span>
                    <span className="text-right font-bold tabular-nums text-midnight-ink">
                      {formatDuration(v.totalTimeS)}
                    </span>
                    <span className="text-right font-medium tabular-nums text-steel">
                      {formatNumber(v.pumpedL)} L
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
