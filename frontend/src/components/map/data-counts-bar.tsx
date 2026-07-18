"use client";

import { Building2, Droplets, Eye, Hospital, Waves } from "lucide-react";

import type { DatasetKey } from "../data-table-modal";

interface DataCountsBarProps {
  floodCount: number;
  depotCount: number;
  ifCount: number;
  faskesCount: number;
  onPreviewData: (key: DatasetKey) => void;
}

const DATA_ITEMS = [
  { key: "floods" as DatasetKey, label: "Genangan", Icon: Droplets, color: "#ef4444" },
  { key: "depots" as DatasetKey, label: "Depo", Icon: Building2, color: "#f59e0b" },
  { key: "ifs" as DatasetKey, label: "Sungai", Icon: Waves, color: "#0284c7" },
  { key: "faskes" as DatasetKey, label: "Faskes", Icon: Hospital, color: "#059669" },
] as const;

export function DataCountsBar({
  floodCount,
  depotCount,
  ifCount,
  faskesCount,
  onPreviewData,
}: DataCountsBarProps) {
  const counts: Record<string, number> = {
    floods: floodCount,
    depots: depotCount,
    ifs: ifCount,
    faskes: faskesCount,
  };

  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-[10px] rounded-lg border border-frost bg-pure-white px-12 py-8">
      {DATA_ITEMS.map(({ key, label, Icon, color }) => (
        <button
          key={key}
          type="button"
          onClick={() => onPreviewData(key)}
          title={`Lihat data ${label}`}
          className="flex cursor-pointer items-center gap-[5px] rounded-sm border border-transparent bg-transparent px-8 py-4 transition-colors hover:border-frost hover:bg-mist"
        >
          <Icon size={13} strokeWidth={2.2} color={color} />
          <span className="text-[13px] font-bold leading-none text-midnight-ink tabular-nums">
            {counts[key]}
          </span>
          <span className="text-[10.5px] font-semibold leading-none text-slate">{label}</span>
          <Eye size={11} strokeWidth={2} color="var(--color-smoke)" className="ml-[2px]" />
        </button>
      ))}
    </div>
  );
}
