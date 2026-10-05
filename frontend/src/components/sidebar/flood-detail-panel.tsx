"use client";

import { formatDateTimeId } from "../../lib/format";
import { formatDuration, formatMeters, formatNumber } from "../../lib/format-metrics";
import {
  summarizeFloodService,
  type FloodService,
  type FloodServiceStatus,
} from "../../lib/flood-visits";
import {
  DEFAULT_SI,
  ROAD_CLASS_LABELS,
  ROUTE_COLORS,
  SI_PALETTE,
  siColor,
} from "../../lib/map-constants";
import type { FloodPoint, OptimizationResult } from "../../types";
import {
  DetailColumns,
  DetailFact,
  DetailFacts,
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

/** Average of the two tank sizes in the fleet, used to express litres as loads. */
const AVG_TANK_L = 4000;

interface FloodDetailPanelProps {
  flood: FloodPoint;
  /** Position in the scenario's flood list, matching the "Genangan N" label. */
  index: number;
  /** Severity rank among the scenario's points (1 = most severe) and the total. */
  rank: number;
  total: number;
  result: OptimizationResult | null;
  onClose: () => void;
  /** "embedded": a full-width row under the windowed map. */
  variant?: "fullscreen" | "embedded";
}

function siLabel(si: number): string {
  for (const b of SI_PALETTE) if (si <= b.max) return b.labelId;
  return SI_PALETTE[SI_PALETTE.length - 1].labelId;
}

const STATUS: Record<FloodServiceStatus, { label: string; cls: string }> = {
  "no-plan": { label: "Belum ada rencana", cls: "bg-periwinkle-wash text-steel" },
  none: { label: "Tidak dilayani", cls: "bg-[#fef2f2] text-[#b91c1c]" },
  partial: { label: "Dilayani sebagian", cls: "bg-[#fffbeb] text-[#b45309]" },
  done: { label: "Tuntas", cls: "bg-[#f0fdf4] text-[#15803d]" },
};

export function FloodDetailPanel({
  flood,
  index,
  rank,
  total,
  result,
  onClose,
  variant = "fullscreen",
}: FloodDetailPanelProps) {
  const si = flood.si_value ?? DEFAULT_SI;
  const service = summarizeFloodService(result, flood.id, flood.volume_l);
  const status = STATUS[service.status];
  const when = formatDateTimeId(flood.datetime);

  return (
    <DetailShell
      label={`Detail genangan ${index + 1}`}
      closeLabel="Tutup detail genangan"
      onClose={onClose}
      variant={variant}
      mark={
        <span
          aria-hidden
          className="inline-block h-[12px] w-[12px] flex-shrink-0 rounded-full"
          style={{ background: siColor(si) }}
        />
      }
      title={`Genangan ${index + 1}`}
      badge={status}
      subtitle={flood.deskripsi?.trim() || "Tanpa deskripsi lokasi"}
      trailing={<SeverityChip si={si} />}
    >
      <Stats flood={flood} service={service} />

      <DetailColumns>
        <DetailSection title="Lokasi & kondisi">
          <DetailFacts>
            <DetailFact label="Peringkat severity" value={`${rank} dari ${total}`} />
            <DetailFact
              label="Ketinggian"
              value={flood.ketinggian_cm != null ? `${formatNumber(flood.ketinggian_cm)} cm` : "-"}
            />
            <DetailFact
              label="Kelas jalan"
              value={
                flood.road_class != null
                  ? (ROAD_CLASS_LABELS[Math.round(flood.road_class)] ??
                    `Kelas ${flood.road_class}`)
                  : "-"
              }
            />
            <DetailFact
              label="Faskes terdekat"
              value={flood.dist_faskes_m != null ? formatMeters(flood.dist_faskes_m) : "-"}
            />
            <DetailFact label="Dilaporkan" value={when ?? "-"} />
            <DetailFact
              label="Koordinat"
              value={`${flood.lat.toFixed(5)}, ${flood.lon.toFixed(5)}`}
            />
          </DetailFacts>
          <Basis flood={flood} />
        </DetailSection>

        <DetailSection title="Log kendaraan" fill>
          <VisitLog service={service} hasPlan={result !== null} />
        </DetailSection>
      </DetailColumns>
    </DetailShell>
  );
}

function Stats({ flood, service }: { flood: FloodPoint; service: FloodService }) {
  const v = flood.volume_l;
  const hasPlan = service.status !== "no-plan";
  const first = service.visits[0];
  const last = service.visits[service.visits.length - 1];

  return (
    <DetailStats>
      <DetailStat
        label="Estimasi beban"
        value={v != null ? `${formatNumber(v)} L` : "-"}
        sub={
          v != null ? `setara ${formatNumber(v / AVG_TANK_L, 1)} muatan tangki` : "belum diestimasi"
        }
      />
      <DetailStat
        label="Terpompa"
        value={
          hasPlan && service.coveragePct != null ? `${formatNumber(service.coveragePct, 0)}%` : "-"
        }
        sub={
          hasPlan && v != null
            ? `${formatNumber(service.pumpedL)} dari ${formatNumber(v)} L`
            : "belum ada rencana"
        }
        progress={hasPlan ? service.coveragePct : null}
      />
      <DetailStat
        label="Kunjungan"
        value={hasPlan ? formatNumber(service.visits.length) : "-"}
        sub={
          hasPlan
            ? service.visits.length > 0
              ? `oleh ${service.vehicleCount} kendaraan`
              : "tidak ada yang datang"
            : "belum ada rencana"
        }
      />
      <DetailStat
        label="Tiba pertama"
        value={first ? formatDuration(first.arrivalS) : "-"}
        sub={
          last && last !== first
            ? `terakhir ${formatDuration(last.arrivalS)}`
            : "sejak armada berangkat"
        }
        last
      />
    </DetailStats>
  );
}

function SeverityChip({ si }: { si: number }) {
  return (
    <span
      className="inline-flex flex-shrink-0 items-center whitespace-nowrap rounded-md px-[9px] py-[3px] text-[11.5px] font-bold tracking-[0.2px] text-white"
      style={{ background: siColor(si) }}
    >
      {siLabel(si)} · {si.toFixed(2)}
    </span>
  );
}

/** How the volume estimate arises: the three factors multiplied out. */
function Basis({ flood }: { flood: FloodPoint }) {
  const width = flood.road_width_m;
  const length = flood.ponding_length_m;
  const depth = flood.effective_depth_cm;
  if (flood.volume_l == null || width == null || length == null || depth == null) return null;

  return (
    <div className="flex flex-col gap-[3px] rounded-md border border-frost bg-mist px-[10px] py-[8px] text-[11.5px] font-medium leading-[1.4] text-steel">
      <span className="text-[10px] font-bold uppercase tracking-[0.9px] text-slate">
        Dasar estimasi
      </span>
      <span className="text-[13px] font-bold tabular-nums text-midnight-ink">
        {formatNumber(width, 1)} m × {formatNumber(length, 0)} m × {formatNumber(depth / 100, 2)} m
      </span>
      <span>
        lebar jalan × panjang genangan × kedalaman yang dibuang
        {flood.ketinggian_cm != null
          ? ` (${formatNumber(flood.ketinggian_cm)} cm tercatat dikurangi batas aman)`
          : ""}
        .
      </span>
    </div>
  );
}

const LOG_GRID =
  "grid grid-cols-[10px_minmax(0,0.9fr)_minmax(0,1.5fr)_84px_72px] items-center gap-x-[10px]";

function VisitLog({ service, hasPlan }: { service: FloodService; hasPlan: boolean }) {
  if (!hasPlan) {
    return (
      <DetailNote>
        Belum ada rencana rute. Jalankan optimasi untuk melihat kendaraan yang datang ke titik ini.
      </DetailNote>
    );
  }
  if (service.visits.length === 0) {
    return (
      <DetailNote>
        Tidak ada kendaraan yang datang ke titik ini pada rencana saat ini. Bebannya bergulir ke
        periode berikutnya.
        {service.remainingL != null && service.remainingL > 1
          ? ` Sisa ${formatNumber(service.remainingL)} L.`
          : ""}
      </DetailNote>
    );
  }

  return (
    <LogList
      footer={
        service.remainingL != null && service.remainingL > 1 ? (
          <p className="m-0 flex-shrink-0 border-t border-frost pt-[6px] text-[11px] font-medium text-slate">
            Sisa {formatNumber(service.remainingL)} L dilanjutkan ke periode berikutnya.
          </p>
        ) : null
      }
    >
      <LogHead grid={LOG_GRID}>
        <span aria-hidden />
        <span>Kendaraan</span>
        <span>Depo</span>
        <span className="text-right">Tiba</span>
        <span className="text-right">Volume</span>
      </LogHead>
      <LogRows>
        {service.visits.map((v, i) => (
          <li key={`${v.vehicleId}-${i}`} className={`${LOG_GRID} ${LOG_ROW_CLS}`}>
            <span
              aria-hidden
              className="inline-block h-[10px] w-[10px] rounded-full"
              style={{ background: ROUTE_COLORS[v.colorIndex % ROUTE_COLORS.length] }}
            />
            <span
              className="truncate font-bold text-midnight-ink"
              title={`${v.vehicleId} · ${formatNumber(v.capacityL)} L`}
            >
              {v.vehicleId}
            </span>
            <span className="truncate font-medium text-slate" title={v.depotName}>
              {v.depotName}
            </span>
            <span className="text-right font-bold tabular-nums text-midnight-ink">
              {formatDuration(v.arrivalS)}
            </span>
            <span className="text-right font-medium tabular-nums text-steel">
              {formatNumber(v.pumpedL)} L
            </span>
          </li>
        ))}
      </LogRows>
    </LogList>
  );
}
