"use client";

import { Database, Layers, Palette, SlidersHorizontal } from "lucide-react";

import { ControlCluster, IconButton } from "./map-controls";

export type MobileToolId = "layers" | "data" | "manage" | "legend";

interface MobileMapToolsProps {
  onOpen: (tool: MobileToolId) => void;
}

/**
 * Square buttons under the zoom pair on a phone. Each opens its panel as a sheet,
 * so the map keeps the whole screen instead of sitting behind a stack of cards.
 */
export function MobileMapTools({ onOpen }: MobileMapToolsProps) {
  return (
    <>
      <ControlCluster>
        <IconButton label="Lapisan peta" onClick={() => onOpen("layers")}>
          <Layers size={17} strokeWidth={2} />
        </IconButton>
      </ControlCluster>
      <ControlCluster>
        <IconButton label="Data" onClick={() => onOpen("data")}>
          <Database size={17} strokeWidth={2} />
        </IconButton>
      </ControlCluster>
      <ControlCluster>
        <IconButton label="Kelola" onClick={() => onOpen("manage")}>
          <SlidersHorizontal size={17} strokeWidth={2} />
        </IconButton>
      </ControlCluster>
      <ControlCluster>
        <IconButton label="Legenda" onClick={() => onOpen("legend")}>
          <Palette size={17} strokeWidth={2} />
        </IconButton>
      </ControlCluster>
    </>
  );
}
