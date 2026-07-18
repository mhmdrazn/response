"use client";

import type { DatasetKey } from "../data-table-modal";
import type { BaseMapId, OverlayLayerId } from "../../lib/map-constants";
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

/** Desktop/tablet only — mobile uses the flex-stacked MobileDataLayerDock
 *  in app-shell.tsx instead, to guarantee no overlap with other docks. */
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
        floodCount={floodCount}
        depotCount={depotCount}
        ifCount={ifCount}
        faskesCount={faskesCount}
        overlays={overlays}
        setOverlay={setOverlay}
        baseMap={baseMap}
        setBaseMap={setBaseMap}
        onPreviewData={onPreviewData}
        defaultOpen={false}
      />
    </div>
  );
}
