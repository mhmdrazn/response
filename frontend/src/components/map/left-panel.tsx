"use client";

import { useEffect, useRef } from "react";

import type { DatasetKey } from "../data-table-modal";
import type { BaseMapId, OverlayLayerId } from "../../lib/map-constants";
import { DataDock } from "./data-dock";
import { MapControls } from "./map-controls";
import { MapLayerDock } from "./map-layer-dock";

interface LeftPanelProps {
  floodCount: number;
  depotCount: number;
  ifCount: number;
  faskesCount: number;
  overlays: Record<OverlayLayerId, boolean>;
  setOverlay: (id: OverlayLayerId, visible: boolean) => void;
  baseMap: BaseMapId;
  setBaseMap: (id: BaseMapId) => void;
  onPreviewData: (key: DatasetKey) => void;
  onReloadData?: () => void;
  reloadingData?: boolean;
  scenario?: string;
  /** Hidden state for the hide-all-panels animation. */
  hidden?: boolean;
}

export function LeftPanel({
  floodCount,
  depotCount,
  ifCount,
  faskesCount,
  overlays,
  setOverlay,
  baseMap,
  setBaseMap,
  onPreviewData,
  onReloadData,
  reloadingData,
  scenario,
  hidden = false,
}: LeftPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Publish the stack's real height so the algorithm panel above it can stop
  // short of it. The docks open and close, so a fixed clearance goes stale.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--left-stack-h", `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--left-stack-h");
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={`pointer-events-none absolute bottom-16 left-16 z-[1000] flex w-[340px] flex-col gap-8 transition-opacity duration-300 ease-out ${
        hidden ? "opacity-0 [&_*]:pointer-events-none" : "opacity-100"
      }`}
    >
      <MapControls />

      <MapLayerDock
        overlays={overlays}
        setOverlay={setOverlay}
        baseMap={baseMap}
        setBaseMap={setBaseMap}
        defaultOpen
      />

      <DataDock
        floodCount={floodCount}
        depotCount={depotCount}
        ifCount={ifCount}
        faskesCount={faskesCount}
        onPreviewData={onPreviewData}
        onReloadData={onReloadData}
        reloadingData={reloadingData}
        scenario={scenario}
        defaultOpen
      />
    </div>
  );
}
