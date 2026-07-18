"use client";

import {
  Building2,
  ChevronDown,
  Droplets,
  Eye,
  Hospital,
  Layers,
  Map as MapIcon,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import type { DatasetKey } from "../data-table-modal";
import { BASE_MAP_LAYERS, type BaseMapId, type OverlayLayerId } from "../../lib/map-constants";

interface MapLayerDockProps {
  floodCount: number;
  depotCount: number;
  ifCount: number;
  faskesCount: number;
  overlays: Record<OverlayLayerId, boolean>;
  setOverlay: (id: OverlayLayerId, visible: boolean) => void;
  baseMap: BaseMapId;
  setBaseMap: (id: BaseMapId) => void;
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

interface BaseMapOption {
  id: BaseMapId;
  label: string;
  tilePreview: string;
}

const TILE_Z = 12;
const TILE_X = 3330;
const TILE_Y = 2130;

const BASE_MAP_OPTIONS: BaseMapOption[] = [
  {
    id: "standard",
    label: BASE_MAP_LAYERS.standard.label,
    tilePreview: `https://tile.openstreetmap.org/${TILE_Z}/${TILE_X}/${TILE_Y}.png`,
  },
  {
    id: "positron",
    label: BASE_MAP_LAYERS.positron.label,
    tilePreview: `https://a.basemaps.cartocdn.com/light_all/${TILE_Z}/${TILE_X}/${TILE_Y}.png`,
  },
  {
    id: "darkmatter",
    label: BASE_MAP_LAYERS.darkmatter.label,
    tilePreview: `https://a.basemaps.cartocdn.com/dark_all/${TILE_Z}/${TILE_X}/${TILE_Y}.png`,
  },
  {
    id: "satellite",
    label: BASE_MAP_LAYERS.satellite.label,
    tilePreview: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${TILE_Z}/${TILE_Y}/${TILE_X}`,
  },
];

interface OverlayOption {
  id: OverlayLayerId;
  label: string;
  Icon: LucideIcon;
  activeColor: string;
}

const OVERLAY_OPTIONS: OverlayOption[] = [
  { id: "floods", label: "Genangan", Icon: Droplets, activeColor: "#ef4444" },
  { id: "depots", label: "Depo", Icon: Building2, activeColor: "#f59e0b" },
  { id: "ifs", label: "Sungai", Icon: Waves, activeColor: "#0284c7" },
  { id: "faskes", label: "Faskes", Icon: Hospital, activeColor: "#059669" },
  { id: "choropleth", label: "Keparahan Kecamatan", Icon: MapIcon, activeColor: "#f97316" },
];

/** Single unified dock combining the data-counts row and the layer controls
 *  (Peta Dasar + Lapisan Data) into one panel. Replaces the previous
 *  DataCountsBar + LayerControls pair. */
export function MapLayerDock({
  floodCount,
  depotCount,
  ifCount,
  faskesCount,
  overlays,
  setOverlay,
  baseMap,
  setBaseMap,
  onPreviewData,
  defaultOpen = false,
}: MapLayerDockProps) {
  const [open, setOpen] = useState(defaultOpen);

  const counts: Record<string, number> = {
    floods: floodCount,
    depots: depotCount,
    ifs: ifCount,
    faskes: faskesCount,
  };

  return (
    <div className="pointer-events-auto flex flex-col rounded-lg border border-frost bg-pure-white">
      {/* Header row: layers icon + title + chevron toggle (whole row clickable) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="font-manrope flex w-full cursor-pointer items-center gap-[6px] border-0 bg-transparent px-[10px] py-8 text-left"
      >
        <Layers size={14} strokeWidth={2} color="var(--color-slate)" />
        <span className="flex-1 text-[11px] font-bold tracking-[-0.1px] text-midnight-ink">
          Lapisan Peta &amp; Data
        </span>
        <ChevronDown
          size={14}
          color="var(--color-slate)"
          className={`transition-transform duration-[220ms] ${open ? "rotate-0" : "-rotate-90"}`}
        />
      </button>

      {/* Collapsible body: data counts + Peta Dasar + Lapisan Data */}
      <div
        className={`scrollbar-hidden flex flex-col gap-[10px] transition-[max-height,opacity,padding] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
          open
            ? "pointer-events-auto max-h-[min(420px,60vh)] overflow-auto border-t border-frost px-12 pb-12 pt-[10px] opacity-100"
            : "pointer-events-none max-h-0 overflow-hidden border-t border-transparent px-12 py-0 opacity-0"
        }`}
      >
        <div className="flex flex-wrap gap-[4px]">
          {DATA_ITEMS.map(({ key, label, Icon, color }) => (
            <button
              key={key}
              type="button"
              onClick={() => onPreviewData(key)}
              title={`Lihat data ${label}`}
              className="flex cursor-pointer items-center gap-[4px] rounded-sm border border-transparent bg-transparent px-[7px] py-[3px] transition-colors hover:border-frost hover:bg-mist"
            >
              <Icon size={12} strokeWidth={2.2} color={color} />
              <span className="text-[12px] font-bold leading-none text-midnight-ink tabular-nums">
                {counts[key]}
              </span>
              <span className="text-[10px] font-semibold leading-none text-slate">{label}</span>
              <Eye size={10} strokeWidth={2} color="var(--color-smoke)" className="ml-px" />
            </button>
          ))}
        </div>

        <div aria-hidden className="h-px bg-frost" />

        <PanelSection label="Peta Dasar" noWrap>
          <div className="flex w-full gap-[6px]">
            {BASE_MAP_OPTIONS.map(({ id, label, tilePreview }) => (
              <BaseMapTile
                key={id}
                label={label}
                previewUrl={tilePreview}
                active={baseMap === id}
                onClick={() => setBaseMap(id)}
              />
            ))}
          </div>
        </PanelSection>

        <div aria-hidden className="h-px bg-frost" />

        <PanelSection label="Lapisan Data">
          {OVERLAY_OPTIONS.map(({ id, label, Icon, activeColor }) => (
            <Pill
              key={id}
              label={label}
              active={overlays[id]}
              activeColor={activeColor}
              onClick={() => setOverlay(id, !overlays[id])}
            >
              <Icon size={14} strokeWidth={2} />
            </Pill>
          ))}
        </PanelSection>
      </div>
    </div>
  );
}

function BaseMapTile({
  label,
  previewUrl,
  active,
  onClick,
}: {
  label: string;
  previewUrl: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-[4px] overflow-hidden rounded-md border-2 bg-pure-white p-0 transition-colors ${
        active ? "border-steel" : "border-frost"
      }`}
    >
      <img
        src={previewUrl}
        alt={label}
        className="block h-[36px] w-full rounded-t-[3px] object-cover object-center"
      />
      <span
        className={`pb-[4px] text-[9.5px] leading-none tracking-[-0.05px] ${
          active ? "font-bold text-midnight-ink" : "font-semibold text-steel"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

function PanelSection({
  label,
  children,
  noWrap = false,
}: {
  label: string;
  children: ReactNode;
  noWrap?: boolean;
}) {
  return (
    <div className="flex flex-col gap-[6px]">
      <div className="pl-[2px] text-[10px] font-bold uppercase tracking-[0.9px] text-slate">
        {label}
      </div>
      <div className={`flex gap-[5px] ${noWrap ? "flex-nowrap" : "flex-wrap"}`}>{children}</div>
    </div>
  );
}

function Pill({
  active,
  activeColor,
  onClick,
  label,
  children,
}: {
  active: boolean;
  activeColor: string;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-[6px] whitespace-nowrap rounded-md border py-[5px] pl-8 pr-[10px] text-[12px] font-semibold tracking-[-0.1px] transition-colors ${
        active
          ? "border-transparent text-white"
          : "border-frost bg-pure-white text-steel hover:bg-frost hover:text-midnight-ink"
      }`}
      style={active ? { background: activeColor, borderColor: activeColor } : undefined}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
