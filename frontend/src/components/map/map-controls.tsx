"use client";

import { Crosshair, LayoutDashboard, Maximize2, Minus, Plus } from "lucide-react";

import { useMapContext } from "./map-context";

interface MapControlsProps {
  /** "vertical" stacks the clusters in a column, for a map's right edge. */
  orientation?: "horizontal" | "vertical";
}

/**
 * The map's own buttons: 3D view, the switch between full map and dashboard, back
 * to the centre of Surabaya, and zoom.
 */
export function MapControls({ orientation = "horizontal" }: MapControlsProps) {
  const { threeD, layout, onToggleLayout } = useMapContext();
  const vertical = orientation === "vertical";
  const toWindowed = layout !== "windowed";

  return (
    <div
      className={`pointer-events-none flex items-start gap-8 ${vertical ? "flex-col" : "flex-row"}`}
    >
      <ControlCluster vertical={vertical}>
        <IconButton
          label={threeD.active ? "Tampilan 2D" : "Tampilan 3D"}
          pressed={threeD.active}
          onClick={threeD.toggle}
        >
          <span className="text-[13px] font-bold tracking-[-0.3px]">3D</span>
        </IconButton>
        {onToggleLayout ? (
          <>
            <Divider vertical={vertical} />
            <IconButton
              label={toWindowed ? "Tampilan berjendela (dashboard)" : "Tampilan peta penuh"}
              onClick={onToggleLayout}
            >
              {toWindowed ? (
                <LayoutDashboard size={17} strokeWidth={2} />
              ) : (
                <Maximize2 size={17} strokeWidth={2} />
              )}
            </IconButton>
          </>
        ) : null}
        <Divider vertical={vertical} />
        <IconButton label="Kembali ke pusat Surabaya" onClick={threeD.recenter}>
          <Crosshair size={18} strokeWidth={2} />
        </IconButton>
      </ControlCluster>

      <ControlCluster vertical={vertical}>
        <IconButton label="Perbesar" onClick={() => threeD.zoomBy(1)}>
          <Plus size={17} strokeWidth={2} />
        </IconButton>
        <Divider vertical={vertical} />
        <IconButton label="Perkecil" onClick={() => threeD.zoomBy(-1)}>
          <Minus size={17} strokeWidth={2} />
        </IconButton>
      </ControlCluster>
    </div>
  );
}

export function ControlCluster({
  children,
  vertical = false,
}: {
  children: React.ReactNode;
  vertical?: boolean;
}) {
  return (
    <div
      className={`border-frost bg-pure-white pointer-events-auto flex overflow-hidden rounded-[12px] border ${
        vertical ? "flex-col" : "flex-row"
      }`}
    >
      {children}
    </div>
  );
}

export function IconButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  /** Set for toggles; a pressed toggle reads in the accent colour. */
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className={`flex h-[40px] w-[40px] cursor-pointer items-center justify-center border-0 transition-colors ${
        pressed
          ? "bg-periwinkle-wash text-indigo-ink hover:bg-frost"
          : "bg-pure-white text-midnight-ink hover:bg-mist"
      }`}
    >
      {children}
    </button>
  );
}

function Divider({ vertical = false }: { vertical?: boolean }) {
  return (
    <div
      aria-hidden
      className={vertical ? "bg-frost mx-8 h-px self-stretch" : "bg-frost my-8 w-px self-stretch"}
    />
  );
}
