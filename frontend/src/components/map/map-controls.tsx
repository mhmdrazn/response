"use client";

import { useMap } from "react-leaflet";

import { DEFAULT_ZOOM, SURABAYA_CENTER } from "../../lib/map-constants";

export function MapControls() {
  const map = useMap();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "flex-start",
        pointerEvents: "none",
      }}
    >
      <ControlCluster>
        <IconButton
          label="Kembali ke pusat Surabaya"
          onClick={() => map.setView(SURABAYA_CENTER, DEFAULT_ZOOM)}
        >
          <CompassIcon />
        </IconButton>
      </ControlCluster>

      <ControlCluster vertical>
        <IconButton label="Perbesar" onClick={() => map.zoomIn()}>
          <PlusIcon />
        </IconButton>
        <Divider />
        <IconButton label="Perkecil" onClick={() => map.zoomOut()}>
          <MinusIcon />
        </IconButton>
      </ControlCluster>
    </div>
  );
}

function ControlCluster({
  children,
  vertical = false,
}: {
  children: React.ReactNode;
  vertical?: boolean;
}) {
  return (
    <div
      style={{
        pointerEvents: "auto",
        background: "var(--color-pure-white)",
        border: "1px solid var(--color-frost)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        display: "flex",
        flexDirection: vertical ? "column" : "row",
      }}
    >
      {children}
    </div>
  );
}

function IconButton({
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
      style={{
        width: 36,
        height: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-pure-white)",
        color: "var(--color-midnight-ink)",
        border: "none",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--color-frost)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--color-pure-white)";
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div aria-hidden style={{ height: 1, background: "var(--color-frost)", width: "100%" }} />;
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
