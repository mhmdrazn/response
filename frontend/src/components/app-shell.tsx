"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAlgorithmConfig } from "../hooks/use-algorithm-config";
import { useBreakpoint } from "../hooks/use-breakpoint";
import { useMapData } from "../hooks/use-map-data";
import { useOptimization } from "../hooks/use-optimization";
import type { BaseMapId, OverlayLayerId } from "../lib/map-constants";
import { OVERLAY_LAYERS } from "../lib/map-constants";
import type { AppMode, RouteOut } from "../types";
import { ErrorBoundary } from "./error-boundary";
import { AlgorithmPanel } from "./sidebar/algorithm-panel";
import { ComparisonPanel } from "./sidebar/comparison-panel";
import { DataTableModal, type DatasetKey } from "./data-table-modal";
import { FloatingNavbar } from "./floating-navbar";
import { ChoroplethLegend } from "./map/choropleth-legend";
import { MapCanvas } from "./map/map-container";
import { MobileDataLayerDock } from "./map/mobile-data-layer-dock";
import { SiLegend } from "./map/si-legend";
import { MobileRunBar } from "./mobile-run-bar";
import { PanelOverlay } from "./panel-overlay";
import { ResultsDock } from "./results-dock";
import { ToastProvider } from "./toast";

const INITIAL_OVERLAYS: Record<OverlayLayerId, boolean> = OVERLAY_LAYERS.reduce(
  (acc, l) => ({ ...acc, [l.id]: l.defaultVisible }),
  {} as Record<OverlayLayerId, boolean>,
);

const PANEL_WIDTH: Record<string, number> = {
  mobile: 0,
  tablet: 300,
  desktop: 340,
};

/** The right-hand results panel is wider than the left algorithm panel —
 *  it holds per-vehicle route lists and comparison tables that need the
 *  extra horizontal room. */
const RESULT_PANEL_WIDTH: Record<string, number> = {
  mobile: 0,
  tablet: 360,
  desktop: 420,
};

/** Distance the desktop/tablet algorithm sidebar keeps from the viewport
 * bottom, so it never overlaps the map's LeftPanel dock in its resting
 * (layers-collapsed) state: compass + zoom + collapsed layer/data dock. */
const SIDEBAR_BOTTOM_CLEARANCE = 220;

const HIDDEN_ROUTES_STORAGE_KEY = "floodroute:hidden-routes:v1";

function loadStoredSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (Array.isArray(arr)) return new Set(arr.filter((v): v is string => typeof v === "string"));
  } catch {
    /* ignore */
  }
  return new Set();
}

function saveStoredSet(key: string, value: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(value)));
  } catch {
    /* ignore */
  }
}

export function AppShell() {
  const bp = useBreakpoint();
  const [mode, setMode] = useState<AppMode>("simple");
  const [overlays, setOverlays] = useState<Record<OverlayLayerId, boolean>>(INITIAL_OVERLAYS);
  const [baseMap, setBaseMap] = useState<BaseMapId>("standard");
  const [highlightVehicleId, setHighlightVehicleId] = useState<string | null>(null);
  const [focusedRoute, setFocusedRoute] = useState<RouteOut | null>(null);
  const [previewDataset, setPreviewDataset] = useState<DatasetKey | null>(null);

  const [mobilePanel, setMobilePanel] = useState<"none" | "algorithm" | "results">("none");

  const [hiddenRoutes, setHiddenRoutes] = useState<Set<string>>(new Set());
  const hydratedHidden = useRef(false);

  // Basemap to restore when the choropleth overlay is turned back off.
  const preChoroplethBaseMap = useRef<BaseMapId>("standard");

  useEffect(() => {
    setHiddenRoutes(loadStoredSet(HIDDEN_ROUTES_STORAGE_KEY));
    hydratedHidden.current = true;
  }, []);

  useEffect(() => {
    if (!hydratedHidden.current) return;
    saveStoredSet(HIDDEN_ROUTES_STORAGE_KEY, hiddenRoutes);
  }, [hiddenRoutes]);

  const toggleRouteVisibility = useCallback((vehicleId: string) => {
    setHiddenRoutes((prev) => {
      const next = new Set(prev);
      if (next.has(vehicleId)) next.delete(vehicleId);
      else next.add(vehicleId);
      return next;
    });
  }, []);

  const { data, loading, error: dataError, reload } = useMapData();
  const {
    result,
    comparison,
    isLoading,
    error: optError,
    run,
    runComparison,
    reset,
  } = useOptimization();
  const algoCfg = useAlgorithmConfig();

  // Drop stale hidden-route ids whenever result changes so the persisted
  // set does not carry vehicle ids that no longer exist in the new solution.
  useEffect(() => {
    if (!result) return;
    setHiddenRoutes((prev) => {
      const validIds = new Set(result.routes.map((r) => r.vehicle_id));
      const filtered = new Set<string>();
      let changed = false;
      prev.forEach((id) => {
        if (validIds.has(id)) filtered.add(id);
        else changed = true;
      });
      return changed ? filtered : prev;
    });
  }, [result]);

  function setOverlay(id: OverlayLayerId, visible: boolean) {
    setOverlays((prev) => ({ ...prev, [id]: visible }));

    // The choropleth's tinted districts read best over a light basemap, so
    // enabling it auto-switches to "Terang" and disabling it restores the
    // previous basemap (unless the user changed it manually in between).
    if (id === "choropleth") {
      if (visible) {
        setBaseMap((prev) => {
          preChoroplethBaseMap.current = prev;
          return "positron";
        });
      } else {
        setBaseMap((prev) => (prev === "positron" ? preChoroplethBaseMap.current : prev));
      }
    }
  }

  const handlePreviewData = useCallback((key: DatasetKey) => {
    setPreviewDataset(key);
  }, []);

  function getPreviewData() {
    if (!data || !previewDataset) return [];
    const map = {
      floods: data.floods,
      depots: data.depots,
      ifs: data.ifs,
      faskes: data.faskes,
    };
    return map[previewDataset];
  }

  const isMobile = bp === "mobile";
  const panelW = PANEL_WIDTH[bp];
  const resultPanelW = RESULT_PANEL_WIDTH[bp];

  function handleRun() {
    setFocusedRoute(null);
    setHiddenRoutes(new Set());
    run(algoCfg.buildRunRequest());
    if (isMobile) setMobilePanel("none");
  }

  function handleCompare() {
    setFocusedRoute(null);
    setHiddenRoutes(new Set());
    runComparison();
    if (isMobile) setMobilePanel("none");
  }

  // Only show routes on the map that are not hidden by the user.
  const visibleRoutes = (result?.routes ?? []).filter((r) => !hiddenRoutes.has(r.vehicle_id));

  const algorithmPanelContent = (
    <AlgorithmPanel
      mode={mode}
      isLoading={isLoading}
      hasResult={result !== null}
      error={optError}
      algorithm={algoCfg.algorithm}
      onAlgorithmChange={algoCfg.setAlgorithm}
      acsParams={algoCfg.acsParams}
      updateACS={algoCfg.updateACS}
      vnsParams={algoCfg.vnsParams}
      updateVNS={algoCfg.updateVNS}
      onRun={handleRun}
      onCompare={handleCompare}
      onReset={() => {
        reset();
        setFocusedRoute(null);
        setHighlightVehicleId(null);
        setHiddenRoutes(new Set());
      }}
    />
  );

  const resultsPanelContent = result ? (
    <>
      {comparison ? <ComparisonPanel comparison={comparison} /> : null}
      <ResultsDock
        result={result}
        mode={mode}
        severity={data?.severity ?? null}
        highlightVehicleId={highlightVehicleId}
        onHoverRoute={setHighlightVehicleId}
        onFocusRoute={setFocusedRoute}
        hiddenVehicleIds={hiddenRoutes}
        onToggleVehicleVisibility={toggleRouteVisibility}
      />
    </>
  ) : null;

  return (
    <ErrorBoundary>
      <ToastProvider>
        <div className="relative h-screen w-screen overflow-hidden bg-mist">
          {/* Full-viewport map */}
          <div className="absolute inset-0">
            {data ? (
              <MapCanvas
                floods={data.floods}
                depots={data.depots}
                ifs={data.ifs}
                faskes={data.faskes}
                overlays={overlays}
                setOverlay={setOverlay}
                baseMap={baseMap}
                setBaseMap={setBaseMap}
                routes={visibleRoutes}
                highlightVehicleId={highlightVehicleId}
                setHighlightVehicleId={setHighlightVehicleId}
                focusedRoute={focusedRoute}
                onPreviewData={handlePreviewData}
                isMobile={isMobile}
              />
            ) : (
              <MapStatusPlaceholder loading={loading} error={dataError} />
            )}
          </div>

          {/* Top-left: floating navbar */}
          <FloatingNavbar mode={mode} onModeChange={setMode} compact={isMobile} />

          {/* ── Desktop / Tablet: side panels ── */}
          {!isMobile ? (
            <>
              {/* Left panel — bottom offset clears map LeftPanel dock */}
              <div
                className="pointer-events-none absolute left-16 top-[84px] z-[900] flex flex-col gap-[10px] overflow-y-auto"
                style={{ bottom: SIDEBAR_BOTTOM_CLEARANCE, width: panelW }}
              >
                <div className="pointer-events-auto flex flex-col gap-[10px]">
                  {algorithmPanelContent}
                </div>
              </div>

              {/* Right panel — the container has a definite height (top/bottom
                anchored) and does NOT scroll itself. */}
              {result ? (
                <div
                  className="pointer-events-none absolute bottom-16 right-16 top-16 z-[900] flex flex-col gap-[10px] overflow-hidden"
                  style={{ width: resultPanelW }}
                >
                  <div className="pointer-events-auto flex min-h-0 flex-1 flex-col gap-[10px]">
                    {resultsPanelContent}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <>
              {/* ── Mobile: single flex-stacked bottom dock ── */}
              <div className="pointer-events-none absolute bottom-16 left-16 right-16 z-[950] flex flex-col gap-[10px]">
                {result ? (
                  <ResultPeekBar
                    objectiveZ={result.objective_z}
                    onOpen={() => setMobilePanel("results")}
                  />
                ) : null}

                {data && overlays.choropleth ? <ChoroplethLegend /> : null}

                {data ? <SiLegend inline collapsible /> : null}

                {data ? (
                  <MobileDataLayerDock
                    floodCount={data.floods.length}
                    depotCount={data.depots.length}
                    ifCount={data.ifs.length}
                    faskesCount={data.faskes.length}
                    overlays={overlays}
                    setOverlay={setOverlay}
                    baseMap={baseMap}
                    setBaseMap={setBaseMap}
                    onPreviewData={handlePreviewData}
                  />
                ) : null}

                <MobileRunBar
                  algorithm={algoCfg.algorithm}
                  onAlgorithmChange={algoCfg.setAlgorithm}
                  isLoading={isLoading}
                  onRun={handleRun}
                  onOpenSettings={() => setMobilePanel("algorithm")}
                />
              </div>

              <PanelOverlay
                open={mobilePanel === "algorithm"}
                onClose={() => setMobilePanel("none")}
                title="Konfigurasi Algoritma"
              >
                {algorithmPanelContent}
              </PanelOverlay>

              <PanelOverlay
                open={mobilePanel === "results"}
                onClose={() => setMobilePanel("none")}
                title="Hasil Optimasi"
              >
                {resultsPanelContent}
              </PanelOverlay>
            </>
          )}
        </div>

        {/* Data table modal */}
        {previewDataset && data ? (
          <DataTableModal
            datasetKey={previewDataset}
            data={getPreviewData()}
            onClose={() => setPreviewDataset(null)}
            onReload={reload}
          />
        ) : null}
      </ToastProvider>
    </ErrorBoundary>
  );
}

function ResultPeekBar({ objectiveZ, onOpen }: { objectiveZ: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="font-manrope pointer-events-auto flex w-full cursor-pointer items-center justify-between rounded-lg border border-frost bg-pure-white px-[14px] py-[10px] transition-colors hover:border-smoke hover:bg-mist"
    >
      <span className="text-[11px] font-semibold text-slate">Hasil Optimasi</span>
      <span className="text-[12px] font-bold text-midnight-ink tabular-nums">
        Z = {objectiveZ.toFixed(1)} · Lihat Detail →
      </span>
    </button>
  );
}

function MapStatusPlaceholder({ loading, error }: { loading: boolean; error: string | null }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="max-w-md px-6 text-center">
        <p className="text-[20px] font-bold tracking-[-0.2px] text-midnight-ink">
          {loading ? "Memuat data peta..." : error ? "Gagal memuat data" : "Menunggu data"}
        </p>
        {error ? (
          <p className="mt-2 text-[13px] font-medium leading-[1.5] text-steel">
            {error}
            <br />
            <span className="text-slate">
              Pastikan backend berjalan di <code>http://localhost:8000</code>.
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
