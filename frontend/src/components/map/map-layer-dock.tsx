"use client";

import {
  Building2,
  ChevronDown,
  ChevronUp,
  Droplets,
  Eye,
  Hospital,
  Layers,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useState } from "react";

import type { DatasetKey } from "../data-table-modal";
import {
  BASE_MAP_LAYERS,
  type BaseMapId,
  type OverlayLayerId,
} from "../../lib/map-constants";

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

  const bodyStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    maxHeight: open ? "min(420px, 60vh)" : 0,
    padding: open ? "10px 12px 12px" : "0 12px",
    opacity: open ? 1 : 0,
    overflow: open ? "auto" : "hidden",
    transition:
      "max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s ease, padding 0.28s ease",
    pointerEvents: open ? "auto" : "none",
    borderTop: open ? "1px solid var(--color-frost)" : "1px solid transparent",
  };

  return (
    <div
      style={{
        pointerEvents: "auto",
        background: "var(--color-pure-white)",
        border: "1px solid var(--color-frost)",
        borderRadius: "var(--radius-lg)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header row: layers icon + title + chevron toggle (whole row clickable) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 10px",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "var(--font-manrope)",
          textAlign: "left",
          width: "100%",
        }}
      >
        <Layers size={14} strokeWidth={2} color="var(--color-slate)" />
        <span
          style={{
            fontSize: 11,
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-midnight-ink)",
            letterSpacing: "-0.1px",
            flex: 1,
          }}
        >
          Lapisan Peta &amp; Data
        </span>
        <ChevronDown
          size={14}
          color="var(--color-slate)"
          style={{
            transition: "transform 0.22s ease",
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
          }}
        />
      </button>

      {/* Collapsible body: data counts + Peta Dasar + Lapisan Data */}
      <div className="scrollbar-hidden" style={bodyStyle}>
        <div
          style={{
            display: "flex",
            gap: 4,
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
                gap: 4,
                padding: "3px 7px",
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
              <Icon size={12} strokeWidth={2.2} color={color} />
              <span
                style={{
                  fontSize: 12,
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
                  fontSize: 10,
                  color: "var(--color-slate)",
                  fontWeight: "var(--font-weight-semibold)",
                  lineHeight: 1,
                }}
              >
                {label}
              </span>
              <Eye
                size={10}
                strokeWidth={2}
                color="var(--color-smoke)"
                style={{ marginLeft: 1 }}
              />
            </button>
          ))}
        </div>

        <div
          aria-hidden
          style={{ height: 1, background: "var(--color-frost)" }}
        />

        <PanelSection label="Peta Dasar" noWrap>
          <div style={{ display: "flex", gap: 6, width: "100%" }}>
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

        <div
          aria-hidden
          style={{ height: 1, background: "var(--color-frost)" }}
        />

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
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        padding: 0,
        border: "2px solid",
        borderColor: active ? "var(--color-steel)" : "var(--color-frost)",
        borderRadius: "var(--radius-md)",
        background: "var(--color-pure-white)",
        cursor: "pointer",
        overflow: "hidden",
        transition: "border-color 0.14s ease",
        flex: 1,
        minWidth: 0,
      }}
    >
      <img
        src={previewUrl}
        alt={label}
        style={{
          display: "block",
          width: "100%",
          height: 36,
          objectFit: "cover",
          objectPosition: "center",
          borderRadius: "3px 3px 0 0",
        }}
      />
      <span
        style={{
          fontSize: 9.5,
          fontWeight: active
            ? "var(--font-weight-bold)"
            : "var(--font-weight-semibold)",
          color: active ? "var(--color-midnight-ink)" : "var(--color-steel)",
          letterSpacing: "-0.05px",
          paddingBottom: 4,
          lineHeight: 1,
        }}
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
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.9px",
          fontWeight: "var(--font-weight-bold)",
          color: "var(--color-slate)",
          paddingLeft: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: noWrap ? "nowrap" : "wrap",
          gap: 5,
        }}
      >
        {children}
      </div>
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
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px 5px 8px",
        borderRadius: "var(--radius-md)",
        border: "1px solid",
        borderColor: active ? activeColor : "var(--color-frost)",
        background: active ? activeColor : "var(--color-pure-white)",
        color: active ? "#ffffff" : "var(--color-steel)",
        fontSize: 12,
        fontWeight: "var(--font-weight-semibold)",
        letterSpacing: "-0.1px",
        cursor: "pointer",
        transition:
          "background 0.14s ease, color 0.14s ease, border-color 0.14s ease",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          const t = e.currentTarget as HTMLButtonElement;
          t.style.background = "var(--color-frost)";
          t.style.color = "var(--color-midnight-ink)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          const t = e.currentTarget as HTMLButtonElement;
          t.style.background = "var(--color-pure-white)";
          t.style.color = "var(--color-steel)";
        }
      }}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
