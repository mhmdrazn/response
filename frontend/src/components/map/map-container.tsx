"use client";

import dynamic from "next/dynamic";

import type { MapInnerProps } from "./map-inner";

const MapInner = dynamic(() => import("./map-inner").then((m) => m.MapInner), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{ background: "var(--color-mist)" }}
    >
      <div
        style={{
          fontSize: 14,
          color: "var(--color-steel)",
          fontWeight: "var(--font-weight-semibold)",
        }}
      >
        Memuat peta...
      </div>
    </div>
  ),
});

export function MapCanvas(props: MapInnerProps) {
  return <MapInner {...props} />;
}
