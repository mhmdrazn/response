"use client";

import { DockBody } from "./dock-body";
import {
  Building2,
  ChevronDown,
  Database,
  Droplets,
  Eye,
  Hospital,
  RefreshCw,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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
  /** Controlled open state; the left dock stack sets it so the docks fit. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  floodCount: number;
  depotCount: number;
  ifCount: number;
  faskesCount: number;
  onPreviewData: (key: DatasetKey) => void;
  defaultOpen?: boolean;
  /** Refetch all map data from the backend (floods/depo/if/faskes/severity). */
  onReloadData?: () => void;
  reloadingData?: boolean;
  scenario?: string;
  /** Content only, for use inside a sheet that has its own title and frame. */
  bare?: boolean;
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
  open: openProp,
  onOpenChange,
  onReloadData,
  reloadingData = false,
  scenario,
  bare = false,
}: DataDockProps) {
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const open = openProp ?? ownOpen;
  const toggle = () => {
    setOwnOpen(!open);
    onOpenChange?.(!open);
  };
  const [meta, setMeta] = useState<DataMetaResponse | null>(null);

  const loadMeta = useCallback(() => {
    api
      .getDataMeta(scenario)
      .then(setMeta)
      .catch(() => {
        /* freshness is best-effort; ignore fetch failure */
      });
  }, [scenario]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  function handleReload() {
    onReloadData?.(); // refetch map data
    loadMeta(); // refresh freshness timestamps
  }

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
    <div
      className={`pointer-events-auto flex flex-col ${
        bare ? "" : "rounded-lg border border-frost bg-pure-white"
      }`}
    >
      {bare ? null : (
        <button
          type="button"
          onClick={toggle}
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
      )}

      <DockBody open={open} bare={bare} className="flex flex-col">
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
        <div className="mt-[8px] flex items-center justify-between gap-8">
          <span className="min-w-0 text-[10px] font-medium leading-[1.3] text-steel">
            {latestUpdated ? `Data diperbarui: ${formatDateTimeId(latestUpdated)}` : ""}
          </span>
          {onReloadData ? (
            <button
              type="button"
              onClick={handleReload}
              disabled={reloadingData}
              title="Muat ulang data dari server"
              className={`inline-flex flex-shrink-0 items-center gap-[5px] rounded-md border border-frost bg-pure-white px-8 py-[5px] text-[10.5px] font-bold tracking-[-0.1px] text-steel transition-colors hover:bg-mist ${
                reloadingData ? "cursor-wait opacity-60" : "cursor-pointer"
              }`}
            >
              <RefreshCw
                size={11}
                strokeWidth={2.4}
                className={reloadingData ? "animate-spin" : ""}
              />
              Muat ulang
            </button>
          ) : null}
        </div>
      </DockBody>
    </div>
  );
}
