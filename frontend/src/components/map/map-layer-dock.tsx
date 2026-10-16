"use client";

import {
  Building2,
  ChevronDown,
  Droplets,
  Hospital,
  Layers,
  Map as MapIcon,
  TrafficCone,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { basemapCredit, basemapSwatch, type BasemapSwatch } from "../../lib/basemap-style";
import { trafficTilesConfigured } from "../../lib/google-traffic";
import { BASE_MAP_LAYERS, type BaseMapId, type OverlayLayerId } from "../../lib/map-constants";

interface MapLayerDockProps {
  overlays: Record<OverlayLayerId, boolean>;
  setOverlay: (id: OverlayLayerId, visible: boolean) => void;
  baseMap: BaseMapId;
  setBaseMap: (id: BaseMapId) => void;
  defaultOpen?: boolean;
  /** Content only, for use inside a sheet that has its own title and frame. */
  bare?: boolean;
}

const BASE_MAP_IDS: BaseMapId[] = ["standard", "positron", "satellite"];

// Raster basemaps have no palette to draw, so their preview is one real tile over Surabaya.
const RASTER_PREVIEW: Partial<Record<BaseMapId, string>> = {
  standard: "https://tile.openstreetmap.org/12/3330/2130.png",
  satellite:
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/12/2130/3330",
};

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
  { id: "traffic", label: "Lalu Lintas", Icon: TrafficCone, activeColor: "#F23C32" },
];

export function MapLayerDock({
  overlays,
  setOverlay,
  baseMap,
  setBaseMap,
  defaultOpen = false,
  bare = false,
}: MapLayerDockProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={`pointer-events-auto flex flex-col ${
        bare ? "" : "border-frost bg-pure-white rounded-lg border"
      }`}
    >
      {bare ? null : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="font-manrope flex w-full cursor-pointer items-center gap-[6px] border-0 bg-transparent px-[10px] py-8 text-left"
        >
          <Layers size={14} strokeWidth={2} color="var(--color-slate)" />
          <span className="text-midnight-ink flex-1 text-[11px] font-bold tracking-normal">
            Lapisan Peta
          </span>
          <ChevronDown
            size={14}
            color="var(--color-slate)"
            className={`transition-transform duration-[220ms] ${open ? "rotate-0" : "-rotate-90"}`}
          />
        </button>
      )}

      <div
        className={
          bare
            ? "scrollbar-hidden flex flex-col gap-[10px]"
            : `scrollbar-hidden flex flex-col gap-[10px] transition-[max-height,opacity,padding] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
                open
                  ? "border-frost pointer-events-auto max-h-[min(420px,60vh)] overflow-auto border-t px-12 pt-[10px] pb-12 opacity-100"
                  : "pointer-events-none max-h-0 overflow-hidden border-t border-transparent px-12 py-0 opacity-0"
              }`
        }
      >
        <PanelSection label="Peta Dasar" noWrap>
          <div className="flex w-full gap-[6px]">
            {BASE_MAP_IDS.map((id) => (
              <BaseMapTile
                key={id}
                label={BASE_MAP_LAYERS[id].label}
                swatch={basemapSwatch(id)}
                previewUrl={RASTER_PREVIEW[id]}
                active={baseMap === id}
                onClick={() => setBaseMap(id)}
              />
            ))}
          </div>
        </PanelSection>
        {/* The map itself carries no attribution control, so the credit lives here. */}
        <p className="text-slate m-0 -mt-[4px] pl-[2px] text-[10px] leading-[1.35] font-medium">
          {basemapCredit(baseMap)}
        </p>

        <div aria-hidden className="bg-frost h-px" />

        <PanelSection label="Lapisan Data">
          {OVERLAY_OPTIONS.map(({ id, label, Icon, activeColor }) => (
            <Pill
              key={id}
              label={label}
              active={overlays[id]}
              activeColor={activeColor}
              onClick={() => setOverlay(id, !overlays[id])}
              disabledReason={
                id === "traffic" && !trafficTilesConfigured()
                  ? "Atur NEXT_PUBLIC_GOOGLE_MAPS_API_KEY untuk menampilkan lalu lintas langsung"
                  : undefined
              }
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
  swatch,
  previewUrl,
  active,
  onClick,
}: {
  label: string;
  swatch: BasemapSwatch | null;
  previewUrl?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`bg-pure-white flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-[4px] overflow-hidden rounded-md border-2 p-0 transition-colors ${"border-frost"}`}
    >
      {swatch ? (
        <SwatchPreview swatch={swatch} />
      ) : (
        <img
          src={previewUrl}
          alt={label}
          className="block h-[36px] w-full rounded-t-[3px] object-cover object-center"
        />
      )}
      <span
        className={`pb-[4px] text-[9.5px] leading-none tracking-[-0.05px] ${
          active ? "text-midnight-ink font-bold" : "text-steel font-semibold"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

/** A thumbnail drawn in the basemap's own colours: land, a park, a river, two roads. */
function SwatchPreview({ swatch: c }: { swatch: BasemapSwatch }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 80 36"
      preserveAspectRatio="xMidYMid slice"
      className="block h-[36px] w-full rounded-t-[3px]"
    >
      <rect width="80" height="36" fill={c.land} />
      <path d="M48 0h32v14c-8 2-14-2-22 1-4 1-7-4-10-15z" fill={c.green} />
      <path
        d="M-2 27c12-6 20 2 32-3s18-14 30-12 16 6 22 4"
        fill="none"
        stroke={c.water}
        strokeWidth="5"
      />
      <path d="M-2 10L82 20M28 -2L36 38" stroke={c.roadCase} strokeWidth="4.2" />
      <path d="M-2 10L82 20M28 -2L36 38" stroke={c.road} strokeWidth="2.6" />
    </svg>
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
      <div className="text-slate pl-[2px] text-[10px] font-bold tracking-normal uppercase">
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
  disabledReason,
  children,
}: {
  active: boolean;
  activeColor: string;
  onClick: () => void;
  label: string;
  /** Set when the layer cannot be shown; the pill is greyed out and says why. */
  disabledReason?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      disabled={Boolean(disabledReason)}
      title={disabledReason}
      className={`inline-flex cursor-pointer items-center gap-[6px] rounded-md border py-[5px] pr-[10px] pl-8 text-[12px] font-semibold tracking-[-0.1px] whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
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
