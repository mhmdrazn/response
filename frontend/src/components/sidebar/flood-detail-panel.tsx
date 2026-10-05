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
      className="border-frost bg-pure-white @container pointer-events-auto flex max-h-[min(340px,45vh)] w-full max-w-[820px] flex-col overflow-hidden rounded-lg border"
    >
      <header className="border-frost flex flex-shrink-0 items-center gap-[10px] border-b px-[14px] py-[10px]">
        <span
          aria-hidden
          className="inline-block h-[12px] w-[12px] flex-shrink-0 rounded-full"
          style={{ background: siColor(si) }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-[2px]">
            <h2 className="text-midnight-ink m-0 text-[14px] leading-[1.2] font-bold tracking-[-0.15px]">
              Genangan {index + 1}
            </h2>
            <span
              className={`rounded-md px-[8px] py-px text-[10.5px] font-bold tracking-[0.2px] ${status.cls}`}
            >
              {status.label}
            </span>
          </div>
          <p className="text-slate m-0 mt-[2px] truncate text-[11.5px] font-medium">
            {flood.deskripsi?.trim() || "Tanpa deskripsi lokasi"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup detail genangan"
          title="Tutup (Esc)"
          className="border-frost bg-pure-white text-steel hover:bg-mist inline-flex h-[28px] w-[28px] flex-shrink-0 cursor-pointer items-center justify-center rounded-md border transition-colors"
        >
          <X size={14} strokeWidth={2.2} />
        </button>
      </header>

      <div className="@min-[500px]:divide-frost grid min-h-0 flex-1 grid-cols-1 overflow-y-auto @min-[500px]:grid-cols-3 @min-[500px]:divide-x">
        <Section title="Lokasi & kondisi">
          <Row label="Severity" value={<SeverityChip si={si} />} />
          <Row label="Peringkat" value={`${rank} dari ${total}`} />
          <Row
            label="Ketinggian"
            value={flood.ketinggian_cm != null ? `${formatNumber(flood.ketinggian_cm)} cm` : "-"}
          />
          <Row
            label="Kelas jalan"
            value={
              flood.road_class != null
                ? (ROAD_CLASS_LABELS[Math.round(flood.road_class)] ?? `Kelas ${flood.road_class}`)
                : "-"
            }
          />
          <Row
            label="Faskes terdekat"
            value={flood.dist_faskes_m != null ? formatMeters(flood.dist_faskes_m) : "-"}
          />
          <Row label="Dilaporkan" value={when ?? "-"} />
          <Row label="Koordinat" value={`${flood.lat.toFixed(5)}, ${flood.lon.toFixed(5)}`} />
        </Section>

        <Section title="Estimasi beban pemompaan">
          <VolumeBlock flood={flood} />
        </Section>

        <Section title="Log kendaraan">
          <VisitLog service={service} volumeL={flood.volume_l ?? null} hasPlan={result !== null} />
        </Section>
      </div>
    </section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-[6px] px-[14px] py-[10px]">
      <h3 className="text-slate m-0 text-[10px] font-bold tracking-[0.9px] uppercase">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-[10px] text-[12px]">
      <span className="text-slate flex-shrink-0 font-semibold">{label}</span>
      <span className="text-midnight-ink min-w-0 text-right font-bold break-words">{value}</span>
    </div>
  );
}

function SeverityChip({ si }: { si: number }) {
  return (
    <span
      className="inline-flex items-center rounded-md px-[8px] py-px text-[11px] font-bold tracking-[0.2px] whitespace-nowrap text-white"
      style={{ background: siColor(si) }}
    >
      {siLabel(si)} · {si.toFixed(2)}
    </span>
  );
}

function VolumeBlock({ flood }: { flood: FloodPoint }) {
  const v = flood.volume_l;
  if (v == null) {
    return (
      <p className="text-slate m-0 text-[12px] leading-[1.45] font-medium">
        Titik ini belum punya estimasi volume. Bangun ulang skenario atau jalankan backfill.
      </p>
    );
  }
  const m3 = v / 1000;
  const width = flood.road_width_m;
  const length = flood.ponding_length_m;
  const depth = flood.effective_depth_cm;
  const known = width != null && length != null && depth != null;

  return (
    <>
      <div className="flex items-baseline gap-[6px]">
        <span className="text-midnight-ink text-[22px] leading-none font-bold tracking-[-0.4px] tabular-nums">
          {formatNumber(m3, 1)}
        </span>
        <span className="text-steel text-[12px] font-bold">m³</span>
      </div>
      <p className="text-steel m-0 text-[12px] leading-[1.4] font-medium">
        {formatNumber(v)} L, setara kira-kira{" "}
        <strong className="text-midnight-ink">
          {formatNumber(v / AVG_TANK_L, 1)} muatan tangki
        </strong>{" "}
        (rata-rata {formatNumber(AVG_TANK_L)} L).
      </p>
      {known ? (
        <div className="border-frost bg-mist text-steel flex flex-col gap-[3px] rounded-md border px-[10px] py-[7px] text-[11.5px] leading-[1.4] font-medium">
          <span className="text-midnight-ink font-bold">
            {formatNumber(width, 1)} m × {formatNumber(length, 0)} m ×{" "}
            {formatNumber(depth / 100, 2)} m
          </span>
          <span>
            lebar jalan × panjang genangan × kedalaman yang perlu dibuang
            {flood.ketinggian_cm != null
              ? ` (${formatNumber(flood.ketinggian_cm)} cm tercatat, sisa air setinggi batas aman tidak dipompa)`
              : ""}
            .
          </span>
        </div>
      ) : null}
    </>
  );
}

function VisitLog({
  service,
  volumeL,
  hasPlan,
}: {
  service: FloodService;
  volumeL: number | null;
  hasPlan: boolean;
}) {
  if (!hasPlan) {
    return (
      <p className="text-slate m-0 text-[12px] leading-[1.45] font-medium">
        Belum ada rencana rute. Jalankan optimasi untuk melihat kendaraan yang datang ke titik ini.
      </p>
    );
  }
  if (service.visits.length === 0) {
    return (
      <p className="text-slate m-0 text-[12px] leading-[1.45] font-medium">
        Tidak ada kendaraan yang datang ke titik ini pada rencana saat ini. Bebannya bergulir ke
        periode berikutnya.
      </p>
    );
  }

  return (
    <>
      {volumeL != null && service.coveragePct != null ? (
        <div className="flex flex-col gap-[4px]">
          <div className="text-steel flex items-baseline justify-between gap-8 text-[11.5px] font-semibold">
            <span>
              {formatNumber(service.pumpedL)} dari {formatNumber(volumeL)} L terpompa
            </span>
            <span className="text-midnight-ink font-bold tabular-nums">
              {formatNumber(service.coveragePct, 0)}%
            </span>
          </div>
          <div className="bg-frost h-[5px] w-full overflow-hidden rounded-full">
            <div
              className="bg-midnight-ink h-full rounded-full"
              style={{ width: `${service.coveragePct}%` }}
            />
          </div>
          {service.remainingL != null && service.remainingL > 1 ? (
            <span className="text-slate text-[11px] font-medium">
              Sisa {formatNumber(service.remainingL)} L dilanjutkan ke periode berikutnya.
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="text-slate text-[11px] font-medium">
        {service.visits.length} kunjungan oleh {service.vehicleCount} kendaraan
      </div>

      <ul className="m-0 flex list-none flex-col p-0">
        {service.visits.map((v, i) => (
          <li
            key={`${v.vehicleId}-${i}`}
            className="border-frost flex min-w-0 items-center gap-8 border-t py-[5px] text-[11.5px]"
          >
            <span
              aria-hidden
              className="inline-block h-[10px] w-[10px] flex-shrink-0 rounded-full"
              style={{ background: ROUTE_COLORS[v.colorIndex % ROUTE_COLORS.length] }}
            />
            <span className="min-w-0 flex-1">
              <span className="text-midnight-ink block truncate font-bold">
                {v.vehicleId} · {formatNumber(v.capacityL)} L
              </span>
              <span className="text-slate block truncate font-medium">{v.depotName}</span>
            </span>
            <span className="flex-shrink-0 text-right">
              <span className="text-midnight-ink block font-bold tabular-nums">
                {formatDuration(v.arrivalS)}
              </span>
              <span className="text-slate block font-medium tabular-nums">
                {formatNumber(v.pumpedL)} L
              </span>
            </span>
          </li>
        ))}
      </ul>
      <span className="text-slate text-[10.5px] font-medium">
        Waktu dihitung sejak armada berangkat dari depo.
      </span>
    </>
  );
}
