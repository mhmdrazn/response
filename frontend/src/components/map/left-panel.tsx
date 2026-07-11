"use client";

import type { DatasetKey } from "../data-table-modal";
import type { BaseMapId, OverlayLayerId } from "../../lib/map-constants";
import { DataCountsBar } from "./data-counts-bar";
import { LayerControls } from "./layer-controls";
import { MapControls } from "./map-controls";

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
    <div
      style={{
        position: "absolute",
        left: 16,
        bottom: 16,
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
        width: 340,
      }}
    >
      <MapControls />

      <DataCountsBar
        floodCount={floodCount}
        depotCount={depotCount}
        ifCount={ifCount}
        faskesCount={faskesCount}
        onPreviewData={onPreviewData}
      />

      {/* overlay={false}: the expanded layer panel grows this dock's height
          in normal flow. Because LeftPanel is bottom-anchored, it grows
          upward, pushing DataCountsBar and MapControls (compass + zoom) up
          instead of covering them. */}
      <LayerControls
        overlays={overlays}
        setOverlay={setOverlay}
        baseMap={baseMap}
        setBaseMap={setBaseMap}
        overlay={false}
      />
    </div>
  );
}
