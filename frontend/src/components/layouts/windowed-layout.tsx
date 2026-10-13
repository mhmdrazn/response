"use client";

import type { ReactNode } from "react";

import type { BaseMapId, OverlayLayerId } from "../../lib/map-constants";
import type { AppMode } from "../../types";
import type { DatasetKey } from "../data-table-modal";
import { DataDock } from "../map/data-dock";
import { LegendDock } from "../map/legend-dock";
import { MapLayerDock } from "../map/map-layer-dock";
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
  /** Docked under the data dock: add points, fleet and priority settings. */
  manageDock?: ReactNode;
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
  manageDock,
  mapCard,
  detail,
  detailOpen = false,
  results,
  hasResult,
}: WindowedLayoutProps) {
  return (
    <div className="windowed-flat bg-pure-white flex h-screen w-screen flex-col overflow-hidden">
      <header className="border-frost bg-pure-white flex flex-shrink-0 items-center gap-12 border-b px-16 py-[10px]">
        <span
          aria-hidden
          className="navbar-status-dot bg-indigo-ink inline-block h-[10px] w-[10px] flex-shrink-0 rounded-full"
        />
        <span className="text-midnight-ink text-[17px] leading-none font-bold tracking-[-0.2px]">
          Response
        </span>
        <span className="border-frost text-slate ml-8 border-l pl-[10px] text-[12px] leading-none font-semibold">
          Sistem Pendukung Keputusan - Dinas Pemadam Kebakaran dan Penyelamatan Kota Surabaya
        </span>
        <div className="flex-1" />
        <ModeToggle mode={mode} onChange={onModeChange} />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="scrollbar-hidden border-frost bg-mist flex w-[340px] flex-shrink-0 flex-col overflow-y-auto border-r">
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
          {manageDock}
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
          <aside className="windowed-results soft-enter scrollbar-hidden border-frost bg-mist flex w-[420px] flex-shrink-0 flex-col overflow-y-auto border-l">
            {results}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
