"use client";

import { Cross } from "lucide-react";
import { useMemo } from "react";

import { formatMeters, formatNumber } from "../../lib/format-metrics";
import { haversineM } from "../../lib/geo";
import { DEFAULT_SI, FACILITY_COLORS, SI_PALETTE, siColor } from "../../lib/map-constants";
import { localizeHealthcare } from "../../lib/osm-labels";
import type { Faskes, FloodPoint } from "../../types";
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

/** Floods this close count as "around" the facility. */
const NEAR_M = 1000;
/** How many floods the list shows at most. */
const LIST_MAX = 12;

interface ClinicDetailPanelProps {
  clinic: Faskes;
  allClinics: Faskes[];
  floods: FloodPoint[];
  onSelectFlood: (id: string) => void;
  onClose: () => void;
  variant?: "fullscreen" | "embedded";
}

const LOG_GRID = "grid grid-cols-[minmax(0,1fr)_72px_minmax(0,88px)] items-center gap-x-[10px]";

function siLabel(si: number): string {
  for (const b of SI_PALETTE) if (si <= b.max) return b.labelId;
  return SI_PALETTE[SI_PALETTE.length - 1].labelId;
}

interface NearbyFlood {
  flood: FloodPoint;
  /** Position in the scenario's flood list, matching the "Genangan N" label. */
  index: number;
  distM: number;
}

export function ClinicDetailPanel({
  clinic,
  allClinics,
  floods,
  onSelectFlood,
  onClose,
  variant = "fullscreen",
}: ClinicDetailPanelProps) {
  const { sorted, servedCount } = useMemo(() => {
    const sorted: NearbyFlood[] = floods
      .map((flood, index) => ({ flood, index, distM: haversineM(clinic, flood) }))
      .sort((a, b) => a.distM - b.distM);

    // Floods for which this is the closest facility, straight-line.
    let servedCount = 0;
    for (const f of floods) {
      const own = haversineM(clinic, f);
      if (allClinics.every((c) => c.id === clinic.id || haversineM(c, f) >= own)) servedCount++;
    }
    return { sorted, servedCount };
  }, [clinic, allClinics, floods]);

  const near = sorted.filter((n) => n.distM <= NEAR_M);
  const maxSi = near.reduce((m, n) => Math.max(m, n.flood.si_value ?? DEFAULT_SI), 0);
  const nearest = sorted[0];
  const shown = (near.length > 0 ? near : sorted.slice(0, 5)).slice(0, LIST_MAX);
  const kind =
    localizeHealthcare(clinic.healthcare) ?? localizeHealthcare(clinic.amenity) ?? "Faskes";
  const title = clinic.name ?? `Faskes ${clinic.id}`;

  return (
    <DetailShell
      label={`Detail fasilitas kesehatan ${title}`}
      closeLabel="Tutup detail fasilitas kesehatan"
      onClose={onClose}
      variant={variant}
      mark={
        <DetailMark color={FACILITY_COLORS.faskes}>
          <Cross size={14} strokeWidth={2.4} />
        </DetailMark>
      }
      title={title}
      badge={{ label: kind, cls: "bg-[#f0fdf4] text-[#15803d]" }}
      subtitle={clinic.street?.trim() || "Alamat tidak tercatat"}
    >
      <DetailStats>
        <DetailStat
          label="Genangan sekitar"
          value={formatNumber(near.length)}
          sub={`dalam radius ${formatMeters(NEAR_M)}`}
        />
        <DetailStat
          label="Genangan terdekat"
          value={nearest ? formatMeters(nearest.distM) : "-"}
          sub={nearest ? `Genangan ${nearest.index + 1}` : "tidak ada data genangan"}
        />
        <DetailStat
          label="Faskes terdekat bagi"
          value={formatNumber(servedCount)}
          sub="genangan (garis lurus)"
        />
        <DetailStat
          label="Severity tertinggi"
          value={near.length > 0 ? maxSi.toFixed(2) : "-"}
          sub={near.length > 0 ? `${siLabel(maxSi)}, dalam radius` : "tidak ada di sekitar"}
          last
        />
      </DetailStats>

      <DetailColumns>
        <DetailSection title="Informasi">
          <DetailFacts>
            <DetailFact label="ID" value={clinic.id} />
            <DetailFact label="Jenis" value={kind} />
            <DetailFact label="Alamat" value={clinic.street?.trim() || "-"} />
            <DetailFact label="Kategori OSM" value={clinic.amenity ?? clinic.type ?? "-"} />
            <DetailFact label="ID OSM" value={String(clinic.osm_id)} />
            <DetailFact
              label="Koordinat"
              value={`${clinic.lat.toFixed(5)}, ${clinic.lon.toFixed(5)}`}
            />
          </DetailFacts>
          <DetailNote>
            Faskes memengaruhi severity genangan: makin dekat, makin tinggi prioritasnya.
          </DetailNote>
        </DetailSection>

        <DetailSection title={near.length > 0 ? "Genangan di sekitar" : "Genangan terdekat"} fill>
          {shown.length === 0 ? (
            <DetailNote>Belum ada data genangan pada skenario ini.</DetailNote>
          ) : (
            <LogList
              footer={
                near.length > LIST_MAX ? (
                  <p className="m-0 flex-shrink-0 border-t border-frost pt-[6px] text-[11px] font-medium text-slate">
                    {near.length - LIST_MAX} genangan lain di radius ini tidak ditampilkan.
                  </p>
                ) : null
              }
            >
              <LogHead grid={LOG_GRID}>
                <span>Lokasi</span>
                <span className="text-right">Jarak</span>
                <span className="text-right">Severity</span>
              </LogHead>
              <LogRows>
                {shown.map((n) => {
                  const si = n.flood.si_value ?? DEFAULT_SI;
                  return (
                    <li key={n.flood.id} className="border-b border-frost last:border-b-0">
                      <button
                        type="button"
                        onClick={() => onSelectFlood(n.flood.id)}
                        title="Buka detail genangan"
                        className={`${LOG_GRID} ${LOG_ROW_CLS} w-full cursor-pointer border-0 bg-transparent px-0 text-left transition-colors hover:bg-mist`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-bold text-midnight-ink">
                            Genangan {n.index + 1}
                          </span>
                          <span className="block truncate text-[11px] font-medium text-slate">
                            {n.flood.deskripsi?.trim() || "Tanpa deskripsi lokasi"}
                          </span>
                        </span>
                        <span className="text-right font-bold tabular-nums text-midnight-ink">
                          {formatMeters(n.distM)}
                        </span>
                        <span className="flex justify-end">
                          <span
                            className="whitespace-nowrap rounded-md px-[7px] py-px text-[10.5px] font-bold text-white"
                            style={{ background: siColor(si) }}
                          >
                            {siLabel(si)} · {si.toFixed(2)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </LogRows>
            </LogList>
          )}
        </DetailSection>
      </DetailColumns>
    </DetailShell>
  );
}
