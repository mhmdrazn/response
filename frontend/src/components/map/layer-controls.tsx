"use client";

import {
  Building2,
  ChevronDown,
  ChevronUp,
  Droplets,
  Hospital,
  Layers,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useState } from "react";

import {
  BASE_MAP_LAYERS,
  type BaseMapId,
  type OverlayLayerId,
} from "../../lib/map-constants";

interface LayerControlsProps {
  overlays: Record<OverlayLayerId, boolean>;
  setOverlay: (id: OverlayLayerId, visible: boolean) => void;
  baseMap: BaseMapId;
  setBaseMap: (id: BaseMapId) => void;
  defaultOpen?: boolean;
  /** true (default): panel floats as an absolute popover above the toggle,
   *  overlaying whatever is above it — used on desktop where the sidebar
   *  already reserves clearance for it (see SIDEBAR_BOTTOM_CLEARANCE).
   *  false: panel renders in normal flex flow above the toggle, growing
   *  the dock's footprint so sibling docks in the same flex stack get
   *  pushed up instead of covered — used in the mobile bottom dock stack. */
  overlay?: boolean;
}

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
  { id: "depots", label: "Depo", Icon: Building2, activeColor: "#533afd" },
  { id: "ifs", label: "Sungai", Icon: Waves, activeColor: "#50617a" },
  { id: "faskes", label: "Faskes", Icon: Hospital, activeColor: "#0891b2" },
];

export function LayerControls({
  overlays,
  setOverlay,
  baseMap,
  setBaseMap,
  defaultOpen = true,
  overlay = true,
}: LayerControlsProps) {
  const [open, setOpen] = useState(defaultOpen);

  const panelPositionStyle: CSSProperties = overlay
    ? {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: "100%",
        marginBottom: 8,
        zIndex: 1001,
      }
    : { position: "static" };

  // Always mounted (not conditional on `open`) so it can transition on both
  // open and close — a CSS transition needs the element present throughout.
  // Collapses via max-height/opacity/transform instead of unmounting.
  const panel = (
    <div
      style={{
        ...panelPositionStyle,
        background: "var(--color-pure-white)",
        border: open
          ? "1px solid var(--color-frost)"
          : "1px solid transparent",
        borderRadius: "var(--radius-lg)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxHeight: open ? "min(300px, 55vh)" : 0,
        padding: open ? 12 : "0 12px",
        opacity: open ? 1 : 0,
        transform: open ? "translateY(0)" : "translateY(6px)",
        overflow: open ? "auto" : "hidden",
        transition:
          "max-height 0.2s ease, opacity 0.15s ease, transform 0.15s ease, padding 0.2s ease, border-color 0.15s ease",
        pointerEvents: open ? "auto" : "none",
      }}
    >
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
  );

  return (
    <div
      style={{
        pointerEvents: "auto",
        position: overlay ? "relative" : "static",
        display: "flex",
        flexDirection: "column",
        gap: !overlay && open ? 8 : 0,
        transition: "gap 0.2s ease",
      }}
    >
      {/* Non-overlay mode: panel sits above the toggle in normal flow, so it
          grows the dock's footprint and pushes sibling docks up instead of
          covering them (mobile bottom dock stack, see app-shell.tsx). */}
      {!overlay ? panel : null}

      {/* Toggle button — in overlay mode the panel below floats as a popover
          and never pushes surrounding docks (see note in app-shell.tsx). */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          background: "var(--color-pure-white)",
          border: "1px solid var(--color-frost)",
          borderRadius: "var(--radius-lg)",
          cursor: "pointer",
          fontFamily: "var(--font-manrope)",
          width: "100%",
        }}
      >
        <Layers size={14} strokeWidth={2} color="var(--color-indigo-ink)" />
        <span
          style={{
            fontSize: 11,
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-midnight-ink)",
            letterSpacing: "-0.1px",
            flex: 1,
            textAlign: "left",
          }}
        >
          Lapisan Peta
        </span>
        {open ? (
          <ChevronDown size={14} color="var(--color-slate)" />
        ) : (
          <ChevronUp size={14} color="var(--color-slate)" />
        )}
      </button>

      {/* Overlay mode: floating popover, opens upward, positioned absolute so
          it overlays the map instead of growing the dock's layout footprint. */}
      {overlay ? panel : null}
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
        borderColor: active ? "var(--color-indigo-ink)" : "var(--color-frost)",
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
          color: active ? "var(--color-indigo-ink)" : "var(--color-steel)",
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
        borderRadius: 999,
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
