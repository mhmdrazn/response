"use client";

import type { DatasetKey } from "../data-table-modal";
import type { BaseMapId, OverlayLayerId } from "../../lib/map-constants";
import { DataCountsBar } from "./data-counts-bar";
import { LayerControls } from "./layer-controls";

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
 *  Meant to be a plain flex child inside app-shell's bottom dock stack,
 *  so spacing with sibling docks is handled by the parent's flex `gap`.
 *  LayerControls uses overlay={false} here so its expanded panel grows
 *  this dock's height in normal flow, pushing ResultPeekBar up (via the
 *  bottom-anchored parent stack) instead of covering it. The standalone
 *  MobileRunBar sits below this group and is unaffected. */
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        pointerEvents: "none",
      }}
    >
      <DataCountsBar
        floodCount={floodCount}
        depotCount={depotCount}
        ifCount={ifCount}
        faskesCount={faskesCount}
        onPreviewData={onPreviewData}
      />
      <LayerControls
        overlays={overlays}
        setOverlay={setOverlay}
        baseMap={baseMap}
        setBaseMap={setBaseMap}
        defaultOpen={false}
        overlay={false}
      />
    </div>
  );
}
