"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <section
      aria-label={`Detail genangan ${index + 1}`}
      className={`@container pointer-events-auto flex max-h-[min(436px,50vh)] w-full flex-col overflow-hidden bg-pure-white ${
        variant === "embedded" ? "border-t border-frost" : "rounded-lg border border-frost"
      }`}
    >
      <header className="flex flex-shrink-0 items-center gap-[10px] border-b border-frost px-[16px] py-[10px]">
        <span
          aria-hidden
          className="inline-block h-[12px] w-[12px] flex-shrink-0 rounded-full"
          style={{ background: siColor(si) }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-[2px]">
            <h2 className="m-0 text-[14px] font-bold leading-[1.2] tracking-[-0.15px] text-midnight-ink">
              Genangan {index + 1}
            </h2>
            <span
              className={`rounded-md px-[8px] py-px text-[10.5px] font-bold tracking-[0.2px] ${status.cls}`}
            >
              {status.label}
            </span>
          </div>
          <p className="m-0 mt-[2px] truncate text-[11.5px] font-medium text-slate">
            {flood.deskripsi?.trim() || "Tanpa deskripsi lokasi"}
          </p>
        </div>
        <SeverityChip si={si} />
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup detail genangan"
          title="Tutup (Esc)"
          className="inline-flex h-[28px] w-[28px] flex-shrink-0 cursor-pointer items-center justify-center rounded-md border border-frost bg-pure-white text-steel transition-colors hover:bg-mist"
        >
          <X size={14} strokeWidth={2.2} />
        </button>
      </header>

      <Stats flood={flood} service={service} />

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto @min-[680px]:grid-cols-[minmax(250px,0.85fr)_minmax(0,1.5fr)] @min-[680px]:divide-x @min-[680px]:divide-frost @min-[680px]:overflow-hidden">
        <Section title="Lokasi & kondisi">
          <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-[14px] gap-y-[6px] text-[12px]">
            <Fact label="Peringkat severity" value={`${rank} dari ${total}`} />
            <Fact
              label="Ketinggian"
              value={flood.ketinggian_cm != null ? `${formatNumber(flood.ketinggian_cm)} cm` : "-"}
            />
            <Fact
              label="Kelas jalan"
              value={
                flood.road_class != null
                  ? (ROAD_CLASS_LABELS[Math.round(flood.road_class)] ??
                    `Kelas ${flood.road_class}`)
                  : "-"
              }
            />
            <Fact
              label="Faskes terdekat"
              value={flood.dist_faskes_m != null ? formatMeters(flood.dist_faskes_m) : "-"}
            />
            <Fact label="Dilaporkan" value={when ?? "-"} />
            <Fact label="Koordinat" value={`${flood.lat.toFixed(5)}, ${flood.lon.toFixed(5)}`} />
          </dl>
          <Basis flood={flood} />
        </Section>

        <Section title="Log kendaraan" fill>
          <VisitLog service={service} hasPlan={result !== null} />
        </Section>
      </div>
    </section>
  );
}

function Stats({ flood, service }: { flood: FloodPoint; service: FloodService }) {
  const v = flood.volume_l;
  const hasPlan = service.status !== "no-plan";
  const first = service.visits[0];
  const last = service.visits[service.visits.length - 1];

  return (
    <div className="grid flex-shrink-0 grid-cols-2 border-b border-frost @min-[600px]:grid-cols-4">
      <Stat
        label="Estimasi beban"
        value={v != null ? `${formatNumber(v)} L` : "-"}
        sub={
          v != null ? `setara ${formatNumber(v / AVG_TANK_L, 1)} muatan tangki` : "belum diestimasi"
        }
      />
      <Stat
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
      <Stat
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
      <Stat
        label="Tiba pertama"
        value={first ? formatDuration(first.arrivalS) : "-"}
        sub={
          last && last !== first
            ? `terakhir ${formatDuration(last.arrivalS)}`
            : "sejak armada berangkat"
        }
        last
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  progress,
  last = false,
}: {
  label: string;
  value: string;
  sub: string;
  progress?: number | null;
  last?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-[3px] px-[16px] py-[10px] ${
        last ? "" : "border-r border-frost"
      }`}
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.9px] text-slate">{label}</span>
      <span className="truncate text-[20px] font-bold leading-[1.1] tracking-[-0.4px] text-midnight-ink tabular-nums">
        {value}
      </span>
      {progress != null ? (
        <span className="block h-[4px] w-full overflow-hidden rounded-full bg-frost">
          <span
            className="soft-grow-x block h-full rounded-full bg-midnight-ink"
            style={{ width: `${progress}%` }}
          />
        </span>
      ) : null}
      <span className="truncate text-[11px] font-medium text-slate">{sub}</span>
    </div>
  );
}

function Section({
  title,
  children,
  fill = false,
}: {
  title: string;
  children: ReactNode;
  /** The children own a scroll region; the section itself does not scroll. */
  fill?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-[8px] px-[16px] py-[10px] @min-[680px]:min-h-0 ${
        fill ? "@min-[680px]:overflow-hidden" : "@min-[680px]:overflow-y-auto"
      }`}
    >
      <h3 className="m-0 flex-shrink-0 text-[10px] font-bold uppercase tracking-[0.9px] text-slate">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="font-semibold text-slate">{label}</dt>
      <dd className="m-0 min-w-0 break-words text-right font-bold text-midnight-ink">{value}</dd>
    </>
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
      <p className="m-0 text-[12px] font-medium leading-[1.45] text-slate">
        Belum ada rencana rute. Jalankan optimasi untuk melihat kendaraan yang datang ke titik ini.
      </p>
    );
  }
  if (service.visits.length === 0) {
    return (
      <p className="m-0 text-[12px] font-medium leading-[1.45] text-slate">
        Tidak ada kendaraan yang datang ke titik ini pada rencana saat ini. Bebannya bergulir ke
        periode berikutnya.
        {service.remainingL != null && service.remainingL > 1
          ? ` Sisa ${formatNumber(service.remainingL)} L.`
          : ""}
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={`${LOG_GRID} flex-shrink-0 border-b border-frost pb-[5px] text-[10px] font-bold uppercase tracking-[0.7px] text-slate`}
      >
        <span aria-hidden />
        <span>Kendaraan</span>
        <span>Depo</span>
        <span className="text-right">Tiba</span>
        <span className="text-right">Volume</span>
      </div>
      <ul className="scrollbar-hidden m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
        {service.visits.map((v, i) => (
          <li
            key={`${v.vehicleId}-${i}`}
            className={`${LOG_GRID} border-b border-frost py-[6px] text-[11.5px] last:border-b-0`}
          >
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
      </ul>
      {service.remainingL != null && service.remainingL > 1 ? (
        <p className="m-0 flex-shrink-0 border-t border-frost pt-[6px] text-[11px] font-medium text-slate">
          Sisa {formatNumber(service.remainingL)} L dilanjutkan ke periode berikutnya.
        </p>
      ) : null}
    </div>
  );
}
