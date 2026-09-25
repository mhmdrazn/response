"use client";

import type { ReactNode } from "react";

import type { BaseMapId, OverlayLayerId } from "../../lib/map-constants";
import type { AppMode, ScenarioMeta } from "../../types";
import type { DatasetKey } from "../data-table-modal";
import { DataDock } from "../map/data-dock";
import { MapLayerDock } from "../map/map-layer-dock";
import { LayoutToggle } from "../floating-navbar";
import { ModeToggle } from "../mode-toggle";
import { ScenarioSelect } from "../scenario-select";

interface Counts {
  floods: number;
  depots: number;
  ifs: number;
  faskes: number;
}

interface WindowedLayoutProps {
  mode: AppMode;
  onModeChange: (m: AppMode) => void;
  onExitWindowed: () => void;
  scenarios: ScenarioMeta[];
  scenario: string | undefined;
  onScenarioChange: (id: string) => void;

  overlays: Record<OverlayLayerId, boolean>;
  setOverlay: (id: OverlayLayerId, visible: boolean) => void;
  baseMap: BaseMapId;
  setBaseMap: (id: BaseMapId) => void;
  counts: Counts;
  onPreviewData: (key: DatasetKey) => void;
  onReloadData: () => void;
  reloadingData: boolean;

  algorithmPanel: ReactNode;
  mapCard: ReactNode;
  results: ReactNode;
  hasResult: boolean;
}

/** Dashboard layout: header + sidebar (controls) + map card + results column. */
export function WindowedLayout({
  mode,
  onModeChange,
  onExitWindowed,
  scenarios,
  scenario,
  onScenarioChange,
  overlays,
  setOverlay,
  baseMap,
  setBaseMap,
  counts,
  onPreviewData,
  onReloadData,
  reloadingData,
  algorithmPanel,
  mapCard,
  results,
  hasResult,
}: WindowedLayoutProps) {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-mist">
      <header className="flex flex-shrink-0 items-center gap-12 border-b border-frost bg-pure-white px-16 py-[10px]">
        <span
          aria-hidden
          className="navbar-status-dot inline-block h-[10px] w-[10px] flex-shrink-0 rounded-full bg-indigo-ink"
        />
        <span className="text-[17px] font-bold leading-none tracking-[-0.2px] text-midnight-ink">
          Response
        </span>
        <span className="ml-8 border-l border-frost pl-[10px] text-[12px] font-semibold leading-none text-slate">
          SPK Damkar Surabaya
        </span>
        {scenarios.length > 1 ? (
          <>
            <div className="h-24 w-px flex-shrink-0 bg-frost" />
            <ScenarioSelect scenarios={scenarios} value={scenario} onChange={onScenarioChange} />
          </>
        ) : null}
        <div className="flex-1" />
        <LayoutToggle layout="windowed" onToggle={onExitWindowed} />
        <div className="h-24 w-px flex-shrink-0 bg-frost" />
        <ModeToggle mode={mode} onChange={onModeChange} />
      </header>

      <div className="flex min-h-0 flex-1 gap-12 p-12">
        <aside className="scrollbar-hidden flex w-[340px] flex-shrink-0 flex-col gap-12 overflow-y-auto">
          {algorithmPanel}
          <MapLayerDock
            overlays={overlays}
            setOverlay={setOverlay}
            baseMap={baseMap}
            setBaseMap={setBaseMap}
            defaultOpen
          />
          <DataDock
            floodCount={counts.floods}
            depotCount={counts.depots}
            ifCount={counts.ifs}
            faskesCount={counts.faskes}
            onPreviewData={onPreviewData}
            onReloadData={onReloadData}
            reloadingData={reloadingData}
            scenario={scenario}
            defaultOpen
          />
        </aside>

        <main className="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-frost">
          {mapCard}
        </main>

        {hasResult ? (
          <aside className="scrollbar-hidden flex w-[420px] flex-shrink-0 flex-col gap-12 overflow-y-auto">
            {results}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
