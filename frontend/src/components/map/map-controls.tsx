"use client";

import { useMap } from "react-leaflet";

import { DEFAULT_ZOOM, SURABAYA_CENTER } from "../../lib/map-constants";

interface MapControlsProps {
  /** "vertical" stacks the compass above the zoom pair, for the phone's right edge. */
  orientation?: "horizontal" | "vertical";
}

export function MapControls({ orientation = "horizontal" }: MapControlsProps) {
  const map = useMap();
  const vertical = orientation === "vertical";

  return (
    <div
      className={`pointer-events-none flex items-start gap-8 ${vertical ? "flex-col" : "flex-row"}`}
    >
      <ControlCluster>
        <IconButton
          label="Kembali ke pusat Surabaya"
          onClick={() => map.setView(SURABAYA_CENTER, DEFAULT_ZOOM)}
        >
          <CompassIcon />
        </IconButton>
      </ControlCluster>

      <ControlCluster vertical={vertical}>
        <IconButton label="Perbesar" onClick={() => map.zoomIn()}>
          <PlusIcon />
        </IconButton>
        <Divider vertical={vertical} />
        <IconButton label="Perkecil" onClick={() => map.zoomOut()}>
          <MinusIcon />
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
      className={`pointer-events-auto flex overflow-hidden rounded-lg border border-frost bg-pure-white ${
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
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-[36px] w-[36px] cursor-pointer items-center justify-center border-0 bg-pure-white text-steel transition-colors hover:bg-frost"
    >
      {children}
    </button>
  );
}

function Divider({ vertical = false }: { vertical?: boolean }) {
  return (
    <div
      aria-hidden
      className={vertical ? "h-px self-stretch bg-frost" : "w-px self-stretch bg-frost"}
    />
  );
}

function CompassIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M 12 4 L 15 12 L 12 20 L 9 12 Z" fill="currentColor" opacity="0.9" />
      <text
        x="12"
        y="7.2"
        fontSize="4.2"
        fontFamily="var(--font-manrope)"
        fontWeight="700"
        textAnchor="middle"
        fill="#ffffff"
      >
        N
      </text>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 12h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
