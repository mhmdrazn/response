"use client";

import type { DatasetKey } from "../data-table-modal";
import type { BaseMapId, OverlayLayerId } from "../../lib/map-constants";
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

/** Mobile counterpart to LeftPanel — no absolute positioning of its own.
 *  Meant to be a plain flex child inside app-shell's bottom dock stack. */
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
  );
}
