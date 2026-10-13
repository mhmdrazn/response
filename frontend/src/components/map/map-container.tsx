"use client";

import dynamic from "next/dynamic";

import type { MapInnerProps } from "./map-inner";
import { MapLoading } from "./map-loading";

const MapInner = dynamic(() => import("./map-inner").then((m) => m.MapInner), {
  ssr: false,
  loading: () => <MapLoading title="Menyiapkan peta" />,
});

export function MapCanvas(props: MapInnerProps) {
  return <MapInner {...props} />;
}
