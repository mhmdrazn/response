"use client";

import type { DatasetKey } from "../data-table-modal";
import type { BaseMapId, OverlayLayerId } from "../../lib/map-constants";
import { DataDock } from "./data-dock";
import { MapLayerDock } from "./map-layer-dock";

interface MobileDataLayerDockProps {
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

export function MobileDataLayerDock({
  floodCount,
  depotCount,
  ifCount,
  faskesCount,
  overlays,
  setOverlay,
  baseMap,
  setBaseMap,
  onPreviewData,
}: MobileDataLayerDockProps) {
  return (
    <div className="flex flex-col gap-8">
      <MapLayerDock
        overlays={overlays}
        setOverlay={setOverlay}
        baseMap={baseMap}
        setBaseMap={setBaseMap}
        defaultOpen={false}
      />
      <DataDock
        floodCount={floodCount}
        depotCount={depotCount}
        ifCount={ifCount}
        faskesCount={faskesCount}
        onPreviewData={onPreviewData}
        defaultOpen={false}
      />
    </div>
  );
}
