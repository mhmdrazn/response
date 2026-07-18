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
    <div
      style={{
        pointerEvents: "auto",
        background: "var(--color-pure-white)",
        border: "1px solid var(--color-frost)",
        borderRadius: "var(--radius-lg)",
        padding: "8px 12px",
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      {DATA_ITEMS.map(({ key, label, Icon, color }) => (
        <button
          key={key}
          type="button"
          onClick={() => onPreviewData(key)}
          title={`Lihat data ${label}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 8px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid transparent",
            background: "transparent",
            cursor: "pointer",
            transition: "border-color 0.15s, background 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--color-frost)";
            e.currentTarget.style.background = "var(--color-mist)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "transparent";
            e.currentTarget.style.background = "transparent";
          }}
        >
          <Icon size={13} strokeWidth={2.2} color={color} />
          <span
            style={{
              fontSize: 13,
              color: "var(--color-midnight-ink)",
              fontWeight: "var(--font-weight-bold)",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
            }}
          >
            {counts[key]}
          </span>
          <span
            style={{
              fontSize: 10.5,
              color: "var(--color-slate)",
              fontWeight: "var(--font-weight-semibold)",
              lineHeight: 1,
            }}
          >
            {label}
          </span>
          <Eye size={11} strokeWidth={2} color="var(--color-smoke)" style={{ marginLeft: 2 }} />
        </button>
      ))}
    </div>
  );
}
