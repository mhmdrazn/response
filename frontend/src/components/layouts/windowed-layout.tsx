"use client";

import type { ReactNode } from "react";

import type { BaseMapId, OverlayLayerId } from "../../lib/map-constants";
import type { AppMode } from "../../types";
import type { DatasetKey } from "../data-table-modal";
import { DataDock } from "../map/data-dock";
import { LegendDock } from "../map/legend-dock";
import { MapLayerDock } from "../map/map-layer-dock";
import { LayoutToggle } from "../floating-navbar";
import { ModeToggle } from "../mode-toggle";

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
  scenario: string | undefined;

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
  /** Detail of the selected map marker: a row under the map, animated open and closed. */
  detail?: ReactNode;
  detailOpen?: boolean;
  results: ReactNode;
  hasResult: boolean;
}

/** Dashboard layout: header + sidebar (controls) + map card + results column. */
export function WindowedLayout({
  mode,
  onModeChange,
  onExitWindowed,
  scenario,
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
  detail,
  detailOpen = false,
  results,
  hasResult,
}: WindowedLayoutProps) {
  return (
    <div className="windowed-flat flex h-screen w-screen flex-col overflow-hidden bg-pure-white">
      <header className="flex flex-shrink-0 items-center gap-12 border-b border-frost bg-pure-white px-16 py-[10px]">
        <span
          aria-hidden
          className="navbar-status-dot inline-block h-[10px] w-[10px] flex-shrink-0 rounded-full bg-indigo-ink"
        />
        <span className="text-[17px] font-bold leading-none tracking-[-0.2px] text-midnight-ink">
          Response
        </span>
        <span className="ml-8 border-l border-frost pl-[10px] text-[12px] font-semibold leading-none text-slate">
          Sistem Pendukung Keputusan - Dinas Pemadam Kebakaran dan Penyelamatan Kota Surabaya
        </span>
        <div className="flex-1" />
        <LayoutToggle layout="windowed" onToggle={onExitWindowed} />
        <div className="h-24 w-px flex-shrink-0 bg-frost" />
        <ModeToggle mode={mode} onChange={onModeChange} />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="scrollbar-hidden flex w-[340px] flex-shrink-0 flex-col overflow-y-auto border-r border-frost bg-mist">
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
          <LegendDock defaultOpen />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="relative min-h-0 flex-1">
            <div className="absolute inset-0">{mapCard}</div>
          </div>
          {detail ? (
            <div className="soft-row" data-open={detailOpen}>
              <div>{detail}</div>
            </div>
          ) : null}
        </main>

        {hasResult ? (
          <aside className="windowed-results soft-enter scrollbar-hidden flex w-[420px] flex-shrink-0 flex-col overflow-y-auto border-l border-frost bg-mist">
            {results}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
