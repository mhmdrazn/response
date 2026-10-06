"use client";

import {
  ChevronDown,
  ChevronRight,
  MapPinPlus,
  SlidersHorizontal,
  Upload,
  Users,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { formatNumber } from "../../lib/format-metrics";
import { PRIORITY_CRITERIA, toShares, type PriorityState } from "../../lib/priority";
import type { FleetSummary } from "../../lib/fleet";
import type { ConfigTab } from "./config-dialog";

interface ManageDockProps {
  fleetCustom: boolean;
  fleetSummary: FleetSummary;
  priority: PriorityState;
  onPickOnMap: () => void;
  onImportCsv: () => void;
  onOpenConfig: (tab: ConfigTab) => void;
  defaultOpen?: boolean;
  /** Content only, for use inside a sheet that has its own title and frame. */
  bare?: boolean;
}

/** Add flood points, and open the fleet and priority settings. */
export function ManageDock({
  fleetCustom,
  fleetSummary,
  priority,
  onPickOnMap,
  onImportCsv,
  onOpenConfig,
  defaultOpen = false,
  bare = false,
}: ManageDockProps) {
  const [open, setOpen] = useState(defaultOpen);

  const prioritySummary =
    priority.mode === "custom"
      ? `Kustom · ${toShares(priority.weights)
          .map((s) => formatNumber(s, 0))
          .join(" / ")}%`
      : "Bawaan · AHP + Entropy";

  const body = (
    <div className="flex flex-col gap-[10px]">
      <div className="flex flex-col gap-[6px]">
        <span className="pl-[2px] text-[10px] font-bold uppercase tracking-normal text-slate">
          Tambah titik genangan
        </span>
        <div className="grid grid-cols-2 gap-[6px]">
          <ActionButton Icon={MapPinPlus} label="Klik di peta" onClick={onPickOnMap} />
          <ActionButton Icon={Upload} label="Unggah CSV" onClick={onImportCsv} />
        </div>
      </div>

      <div aria-hidden className="h-px bg-frost" />

      <div className="flex flex-col gap-[6px]">
        <span className="pl-[2px] text-[10px] font-bold uppercase tracking-normal text-slate">
          Pengaturan optimasi
        </span>
        <SettingRow
          Icon={Waypoints}
          title="Armada & depo"
          detail={`${formatNumber(fleetSummary.units)} unit · ${formatNumber(fleetSummary.activeDepots)} depo`}
          badge={fleetCustom ? "Kustom" : null}
          onClick={() => onOpenConfig("fleet")}
        />
        <SettingRow
          Icon={Users}
          title="Prioritas keparahan"
          detail={prioritySummary}
          badge={priority.mode === "custom" ? "Kustom" : null}
          onClick={() => onOpenConfig("priority")}
        />
        <p className="m-0 pl-[2px] text-[10.5px] font-medium leading-[1.35] text-slate">
          Faktor: {PRIORITY_CRITERIA.map((c) => c.label.toLowerCase()).join(", ")}.
        </p>
      </div>
    </div>
  );

  if (bare) return <div className="pointer-events-auto">{body}</div>;

  return (
    <div className="manage-dock pointer-events-auto flex flex-col rounded-lg border border-frost bg-pure-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="font-manrope flex w-full cursor-pointer items-center gap-[6px] border-0 bg-transparent px-[10px] py-8 text-left"
      >
        <SlidersHorizontal size={14} strokeWidth={2} color="var(--color-slate)" />
        <span className="flex-1 text-[11px] font-bold tracking-[-0.1px] text-midnight-ink">
          Kelola
        </span>
        <ChevronDown
          size={14}
          color="var(--color-slate)"
          className={`transition-transform duration-[220ms] ${open ? "rotate-0" : "-rotate-90"}`}
        />
      </button>
      <div
        className={`flex flex-col transition-[max-height,opacity,padding] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
          open
            ? "pointer-events-auto max-h-[320px] overflow-auto border-t border-frost px-12 pb-12 pt-[10px] opacity-100"
            : "pointer-events-none max-h-0 overflow-hidden border-t border-transparent px-12 py-0 opacity-0"
        }`}
      >
        {body}
      </div>
    </div>
  );
}

function ActionButton({
  Icon,
  label,
  onClick,
}: {
  Icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-manrope inline-flex cursor-pointer items-center justify-center gap-[6px] rounded-md border border-frost bg-pure-white px-[8px] py-[8px] text-[12px] font-bold tracking-[-0.1px] text-midnight-ink transition-colors hover:bg-mist"
    >
      <Icon size={14} strokeWidth={2.1} />
      {label}
    </button>
  );
}

function SettingRow({
  Icon,
  title,
  detail,
  badge,
  onClick,
}: {
  Icon: LucideIcon;
  title: string;
  detail: string;
  badge: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-manrope flex w-full cursor-pointer items-center gap-[10px] rounded-md border border-frost bg-pure-white px-[10px] py-[8px] text-left transition-colors hover:bg-mist"
    >
      <Icon size={15} strokeWidth={2} color="var(--color-steel)" className="flex-shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-[6px]">
          <span className="text-[12px] font-bold text-midnight-ink">{title}</span>
          {badge ? (
            <span className="rounded-sm bg-periwinkle-wash px-[6px] py-px text-[9.5px] font-bold uppercase tracking-[0.5px] text-steel">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="block truncate text-[11px] font-medium text-slate">{detail}</span>
      </span>
      <ChevronRight size={14} color="var(--color-smoke)" className="flex-shrink-0" />
    </button>
  );
}
