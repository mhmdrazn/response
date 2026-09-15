"use client";

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
}: LeftPanelProps) {
  return (
    <div className="pointer-events-none absolute bottom-16 left-16 z-[1000] flex w-[340px] flex-col gap-8">
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
        defaultOpen
      />
    </div>
  );
}
