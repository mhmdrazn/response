"use client";

import {
  Building2,
  ChevronDown,
  Database,
  Droplets,
  Eye,
  Hospital,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "../../lib/api";
import { formatDateTimeId } from "../../lib/format";
import type { DataMetaResponse } from "../../types";
import type { DatasetKey } from "../data-table-modal";

const META_KEY: Record<DatasetKey, keyof DataMetaResponse> = {
  floods: "floods",
  depots: "depo",
  ifs: "if",
  faskes: "faskes",
};

interface DataDockProps {
  floodCount: number;
  depotCount: number;
  ifCount: number;
  faskesCount: number;
  onPreviewData: (key: DatasetKey) => void;
  defaultOpen?: boolean;
}

interface DataCountItem {
  key: DatasetKey;
  label: string;
  Icon: LucideIcon;
  color: string;
}

const DATA_ITEMS: DataCountItem[] = [
  { key: "floods", label: "Genangan", Icon: Droplets, color: "#ef4444" },
  { key: "depots", label: "Depo", Icon: Building2, color: "#f59e0b" },
  { key: "ifs", label: "Sungai", Icon: Waves, color: "#0284c7" },
  { key: "faskes", label: "Faskes", Icon: Hospital, color: "#059669" },
];

export function DataDock({
  floodCount,
  depotCount,
  ifCount,
  faskesCount,
  onPreviewData,
  defaultOpen = false,
}: DataDockProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [meta, setMeta] = useState<DataMetaResponse | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getDataMeta()
      .then((m) => {
        if (alive) setMeta(m);
      })
      .catch(() => {
        /* freshness is best-effort; ignore fetch failure */
      });
    return () => {
      alive = false;
    };
  }, []);

  const latestUpdated = meta
    ? Object.values(meta)
        .map((e) => e.updated_at)
        .filter((v): v is string => v != null)
        .sort()
        .at(-1) ?? null
    : null;

  const counts: Record<string, number> = {
    floods: floodCount,
    depots: depotCount,
    ifs: ifCount,
    faskes: faskesCount,
  };

  return (
    <div className="pointer-events-auto flex flex-col rounded-lg border border-frost bg-pure-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="font-manrope flex w-full cursor-pointer items-center gap-[6px] border-0 bg-transparent px-[10px] py-8 text-left"
      >
        <Database size={14} strokeWidth={2} color="var(--color-slate)" />
        <span className="flex-1 text-[11px] font-bold tracking-[-0.1px] text-midnight-ink">
          Data
        </span>
        <ChevronDown
          size={14}
          color="var(--color-slate)"
          className={`transition-transform duration-[220ms] ${open ? "rotate-0" : "-rotate-90"}`}
        />
      </button>

      <div
        className={`scrollbar-hidden flex flex-col transition-[max-height,opacity,padding] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
          open
            ? "pointer-events-auto max-h-[200px] overflow-auto border-t border-frost px-12 pb-12 pt-[10px] opacity-100"
            : "pointer-events-none max-h-0 overflow-hidden border-t border-transparent px-12 py-0 opacity-0"
        }`}
      >
        <div className="flex flex-wrap gap-[4px]">
          {DATA_ITEMS.map(({ key, label, Icon, color }) => {
            const updated = meta ? formatDateTimeId(meta[META_KEY[key]]?.updated_at) : null;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onPreviewData(key)}
                title={
                  updated ? `Lihat data ${label} · diperbarui ${updated}` : `Lihat data ${label}`
                }
                className="flex cursor-pointer items-center gap-[4px] rounded-sm border border-transparent bg-transparent px-[7px] py-[3px] transition-colors hover:border-frost hover:bg-mist"
              >
                <Icon size={12} strokeWidth={2.2} color={color} />
                <span className="text-[12px] font-bold leading-none text-midnight-ink tabular-nums">
                  {counts[key]}
                </span>
                <span className="text-[10px] font-semibold leading-none text-slate">{label}</span>
                <Eye size={10} strokeWidth={2} color="var(--color-smoke)" className="ml-px" />
              </button>
            );
          })}
        </div>
        {latestUpdated ? (
          <div className="mt-[6px] text-[10px] font-medium leading-none text-steel">
            Data diperbarui: {formatDateTimeId(latestUpdated)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
