"use client";

import { PanelsTopLeft } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { useAlgorithmConfig } from "../hooks/use-algorithm-config";
import { useBreakpoint } from "../hooks/use-breakpoint";
import { useMapData } from "../hooks/use-map-data";
import { useOptimization } from "../hooks/use-optimization";
import { usePresence } from "../hooks/use-presence";
import type { BaseMapId, OverlayLayerId } from "../lib/map-constants";
import { OVERLAY_LAYERS } from "../lib/map-constants";
import { api } from "../lib/api";
import type { AppLayout, AppMode, MapSelection, RouteOut, ScenarioMeta } from "../types";
import { AnimatedHeight } from "./animated-height";
import { ErrorBoundary } from "./error-boundary";
import { AlgorithmPanel } from "./sidebar/algorithm-panel";
import { ComparisonPanel } from "./sidebar/comparison-panel";
import { DataTableModal, type DatasetKey } from "./data-table-modal";
import { FloatingNavbar } from "./floating-navbar";
import { WindowedLayout } from "./layouts/windowed-layout";
import { ClinicDetailPanel } from "./sidebar/clinic-detail-panel";
import { DepotDetailPanel } from "./sidebar/depot-detail-panel";
import { FloodDetailPanel } from "./sidebar/flood-detail-panel";
import { OutletDetailPanel } from "./sidebar/outlet-detail-panel";
import { RouteDetailPanel } from "./sidebar/route-detail-panel";
import { ChoroplethLegend } from "./map/choropleth-legend";
import { MapCanvas } from "./map/map-container";
import { MobileDataLayerDock } from "./map/mobile-data-layer-dock";
import { SiLegend } from "./map/si-legend";
import { MobileRunBar } from "./mobile-run-bar";
import { PanelOverlay } from "./panel-overlay";
import { ResultsDock } from "./results-dock";
import { ToastProvider, useToast } from "./toast";
import type { RunKind } from "../hooks/use-optimization";
import { formatDateTimeId } from "../lib/format";
import { readJSON, readStringSet, writeJSON, writeStringSet } from "../lib/storage";

const INITIAL_OVERLAYS: Record<OverlayLayerId, boolean> = OVERLAY_LAYERS.reduce(
  (acc, l) => ({ ...acc, [l.id]: l.defaultVisible }),
  {} as Record<OverlayLayerId, boolean>,
);

const PANEL_WIDTH: Record<string, number> = {
  mobile: 0,
  tablet: 300,
  desktop: 340,
};

const RESULT_PANEL_WIDTH: Record<string, number> = {
  mobile: 0,
  tablet: 360,
  desktop: 420,
};

// The algorithm panel stops above the layer/data docks. LeftPanel publishes
// their live height as --left-stack-h; 220px is the collapsed fallback.
const SIDEBAR_BOTTOM_CLEARANCE = "calc(var(--left-stack-h, 220px) + 24px)";

// Shared transition for the hide-all-panels animation (smooth in-place fade).
const PANEL_ANIM = "transition-opacity duration-300 ease-out";

const HIDDEN_ROUTES_STORAGE_KEY = "floodroute:hidden-routes:v1";
const LAYOUT_STORAGE_KEY = "floodroute:layout:v1";

function subscribeStorage(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readSavedLayout(): AppLayout {
  return readJSON<unknown>(LAYOUT_STORAGE_KEY, null) === "windowed" ? "windowed" : "fullscreen";
}

export function AppShell() {
  const bp = useBreakpoint();
  const [mode, setMode] = useState<AppMode>("simple");
  // The saved layout is null on the server and until hydration, so the page never
  // flashes the wrong one; a choice made this session takes over from then on.
  const savedLayout = useSyncExternalStore(subscribeStorage, readSavedLayout, () => null);
  const [chosenLayout, setChosenLayout] = useState<AppLayout | null>(null);
  const layout = chosenLayout ?? savedLayout;
  const [overlays, setOverlays] = useState<Record<OverlayLayerId, boolean>>(INITIAL_OVERLAYS);
  const [baseMap, setBaseMap] = useState<BaseMapId>("standard");
  const [highlightVehicleId, setHighlightVehicleId] = useState<string | null>(null);
  const [focusedRoute, setFocusedRoute] = useState<RouteOut | null>(null);
  const [selection, setSelection] = useState<MapSelection | null>(null);
  // Lets the detail panel animate out before it unmounts.
  const { shown: shownSelection, visible: detailVisible } = usePresence(selection);
  const [animating, setAnimating] = useState(false);
  const [panelsHidden, setPanelsHidden] = useState(false);
  const [previewDataset, setPreviewDataset] = useState<DatasetKey | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioMeta[]>([]);
  const [scenario, setScenario] = useState<string | undefined>(undefined);

  const [mobilePanel, setMobilePanel] = useState<"none" | "algorithm" | "results">("none");

  const [hiddenRoutes, setHiddenRoutes] = useState<Set<string>>(new Set());
  const hydratedHidden = useRef(false);

  const preChoroplethBaseMap = useRef<BaseMapId>("standard");

  const changeLayout = useCallback((next: AppLayout) => {
    setChosenLayout(next);
    writeJSON(LAYOUT_STORAGE_KEY, next);
  }, []);

  useEffect(() => {
    setHiddenRoutes(readStringSet(HIDDEN_ROUTES_STORAGE_KEY));
    hydratedHidden.current = true;
  }, []);

  useEffect(() => {
    if (!hydratedHidden.current) return;
    writeStringSet(HIDDEN_ROUTES_STORAGE_KEY, hiddenRoutes);
  }, [hiddenRoutes]);

  const toggleRouteVisibility = useCallback((vehicleId: string) => {
    setHiddenRoutes((prev) => {
      const next = new Set(prev);
      if (next.has(vehicleId)) next.delete(vehicleId);
      else next.add(vehicleId);
      return next;
    });
  }, []);

  // Load the scenario list once; default the selection to the manifest default.
  useEffect(() => {
    let alive = true;
    api
      .getScenarios()
      .then((sl) => {
        if (!alive) return;
        setScenarios(sl.scenarios);
        setScenario((prev) => {
          if (prev) return prev;
          return sl.default || undefined;
        });
      })
      .catch(() => {
        /* scenarios optional; fall back to backend default */
      });
    return () => {
      alive = false;
    };
  }, []);

  const { data, loading, error: dataError, reload } = useMapData(scenario);
  const {
    result,
    comparison,
    isLoading,
    elapsedSeconds,
    progress,
    stage,
    error: optError,
    completedAt,
    lastRunKind,
    runSignal,
    run,
    runComparison,
    reset,
  } = useOptimization();
  const algoCfg = useAlgorithmConfig();

  // Prune stale hidden-route ids when solution changes
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

    // Choropleth auto-switches to light basemap; disabling restores previous
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

  // A route selection points into one plan, so a new run or a reset drops it.
  const dropRouteSelection = () =>
    setSelection((prev) => (prev?.kind === "route" ? null : prev));

  function handleRun() {
    dropRouteSelection();
    setFocusedRoute(null);
    setHiddenRoutes(new Set());
    setAnimating(false);
    run(algoCfg.buildRunRequest(), scenario);
    if (isMobile) setMobilePanel("none");
  }

  function handleCompare() {
    dropRouteSelection();
    setFocusedRoute(null);
    setHiddenRoutes(new Set());
    setAnimating(false);
    runComparison(undefined, scenario, algoCfg.budgetS);
    if (isMobile) setMobilePanel("none");
  }

  function handleScenarioChange(id: string) {
    if (id === scenario) return;
    setScenario(id); // useMapData refetches on change
    reset(); // optimization results are per-scenario
    setSelection(null);
    setFocusedRoute(null);
    setHighlightVehicleId(null);
    setHiddenRoutes(new Set());
    setAnimating(false);
  }

  const visibleRoutes = (result?.routes ?? []).filter((r) => !hiddenRoutes.has(r.vehicle_id));

  const algorithmPanelContent = (
    <AlgorithmPanel
      mode={mode}
      isLoading={isLoading}
      elapsedSeconds={elapsedSeconds}
      progress={progress}
      stage={stage}
      hasResult={result !== null}
      error={optError}
      algorithm={algoCfg.algorithm}
      onAlgorithmChange={algoCfg.setAlgorithm}
      acsParams={algoCfg.acsParams}
      updateACS={algoCfg.updateACS}
      vnsParams={algoCfg.vnsParams}
      updateVNS={algoCfg.updateVNS}
      scenarios={scenarios}
      scenario={scenario}
      onScenarioChange={handleScenarioChange}
      budgetS={algoCfg.budgetS}
      onBudgetChange={algoCfg.setBudgetS}
      onRun={handleRun}
      onCompare={handleCompare}
      onReset={() => {
        reset();
        dropRouteSelection();
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
        completedAt={completedAt}
        severity={data?.severity ?? null}
        highlightVehicleId={highlightVehicleId}
        onHoverRoute={setHighlightVehicleId}
        onFocusRoute={setFocusedRoute}
        hiddenVehicleIds={hiddenRoutes}
        onToggleVehicleVisibility={toggleRouteVisibility}
        animating={animating}
        onToggleAnimating={() => setAnimating((v) => !v)}
      />
    </>
  ) : null;

  const closeDetail = useCallback(() => setSelection(null), []);

  // The detail panel for whichever marker is selected; null once it has animated out.
  const renderDetailPanel = (variant: "fullscreen" | "embedded"): ReactNode => {
    if (!data || !shownSelection) return null;
    switch (shownSelection.kind) {
      case "flood": {
        const index = data.floods.findIndex((f) => f.id === shownSelection.id);
        if (index < 0) return null;
        const si = (f: { si_value?: number }) => f.si_value ?? 0;
        const rank = 1 + data.floods.filter((f) => si(f) > si(data.floods[index])).length;
        return (
          <FloodDetailPanel
            flood={data.floods[index]}
            index={index}
            rank={rank}
            total={data.floods.length}
            result={result}
            onClose={closeDetail}
            variant={variant}
          />
        );
      }
      case "depot": {
        const depot = data.depots.find((d) => d.id === shownSelection.id);
        if (!depot) return null;
        return (
          <DepotDetailPanel
            depot={depot}
            floods={data.floods}
            result={result}
            onClose={closeDetail}
            variant={variant}
          />
        );
      }
      case "if": {
        const outlet = data.ifs.find((f) => f.id === shownSelection.id);
        if (!outlet) return null;
        return (
          <OutletDetailPanel
            outlet={outlet}
            result={result}
            onClose={closeDetail}
            variant={variant}
          />
        );
      }
      case "route": {
        const route = result?.routes.find((r) => r.vehicle_id === shownSelection.id);
        if (!route || !result) return null;
        return (
          <RouteDetailPanel
            route={route}
            objectiveZ={result.objective_z}
            onSelectStop={setSelection}
            onClose={closeDetail}
            variant={variant}
          />
        );
      }
      case "faskes": {
        const clinic = data.faskes.find((f) => f.id === shownSelection.id);
        if (!clinic) return null;
        return (
          <ClinicDetailPanel
            clinic={clinic}
            allClinics={data.faskes}
            floods={data.floods}
            onSelectFlood={(id) => setSelection({ kind: "flood", id })}
            onClose={closeDetail}
            variant={variant}
          />
        );
      }
    }
  };

  // Swapping one detail for another eases the height and fades the new content in.
  const renderDetail = (variant: "fullscreen" | "embedded"): ReactNode => {
    const panel = renderDetailPanel(variant);
    if (!panel || !shownSelection) return null;
    return (
      <AnimatedHeight>
        <div key={`${shownSelection.kind}:${shownSelection.id}`} className="soft-fade">
          {panel}
        </div>
      </AnimatedHeight>
    );
  };

  // Bottom of the map. Fullscreen fills the gap between the left dock stack and
  // the results column (or the severity legend when there are none). The
  // windowed layout does not overlay the map at all: its panel is a row under it.
  const detailPanelInset = (extra: { isMobile: boolean }) => {
    if (extra.isMobile) return { left: 12, right: 12, bottom: 12 };
    return {
      left: panelW + 32,
      right: result ? resultPanelW + 32 : 150,
      bottom: 16,
    };
  };

  const detailRow = renderDetail("embedded");

  // Single source for the map element; both layouts pass only what differs.
  const renderMap = (extra: {
    isMobile: boolean;
    variant?: "fullscreen" | "embedded";
    onReloadData?: () => void;
    reloadingData?: boolean;
    hideChrome?: boolean;
  }) => {
    const floatingDetail = extra.variant !== "embedded" ? renderDetail("fullscreen") : null;
    return data ? (
      <>
        <MapCanvas
          selection={selection}
          onSelect={setSelection}
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
          animating={animating}
          scenario={scenario}
          {...extra}
        />
        {floatingDetail ? (
          <div
            className={`pointer-events-none absolute z-[950] flex justify-center transition-[opacity,transform] duration-300 ease-out ${
              panelsHidden || !detailVisible
                ? "opacity-0 [&_*]:pointer-events-none"
                : "opacity-100"
            } ${detailVisible ? "translate-y-0" : "translate-y-3"}`}
            style={detailPanelInset(extra)}
          >
            {floatingDetail}
          </div>
        ) : null}
      </>
    ) : (
      <MapStatusPlaceholder loading={loading} error={dataError} />
    );
  };

  const dataModal =
    previewDataset && data ? (
      <DataTableModal
        datasetKey={previewDataset}
        data={getPreviewData()}
        onClose={() => setPreviewDataset(null)}
        onReload={reload}
        scenario={scenario}
      />
    ) : null;

  // --- Windowed dashboard layout (desktop only) ---
  if (layout === null) return <div className="h-screen w-screen bg-mist" />;

  if (!isMobile && layout === "windowed") {
    return (
      <ErrorBoundary>
        <ToastProvider>
          <RunNotifier signal={runSignal} completedAt={completedAt} kind={lastRunKind} />
          <WindowedLayout
            mode={mode}
            onModeChange={setMode}
            onExitWindowed={() => changeLayout("fullscreen")}
            scenario={scenario}
            overlays={overlays}
            setOverlay={setOverlay}
            baseMap={baseMap}
            setBaseMap={setBaseMap}
            counts={{
              floods: data?.floods.length ?? 0,
              depots: data?.depots.length ?? 0,
              ifs: data?.ifs.length ?? 0,
              faskes: data?.faskes.length ?? 0,
            }}
            onPreviewData={handlePreviewData}
            onReloadData={reload}
            reloadingData={loading}
            algorithmPanel={algorithmPanelContent}
            mapCard={renderMap({ isMobile: false, variant: "embedded" })}
            detail={detailRow}
            detailOpen={detailVisible}
            results={resultsPanelContent}
            hasResult={result !== null}
          />
          {dataModal}
        </ToastProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <RunNotifier signal={runSignal} completedAt={completedAt} kind={lastRunKind} />
        <div className="relative h-screen w-screen overflow-hidden bg-mist">
          <div className="absolute inset-0">
            {renderMap({
              isMobile,
              onReloadData: reload,
              reloadingData: loading,
              hideChrome: panelsHidden,
            })}
          </div>

          {/* Navbar + show-button stay mounted and cross-fade for a smooth
              hide/show animation. */}
          <FloatingNavbar
            mode={mode}
            onModeChange={setMode}
            compact={isMobile}
            layout={layout}
            onToggleLayout={() => changeLayout("windowed")}
            onHidePanels={!isMobile ? () => setPanelsHidden(true) : undefined}
            className={`${PANEL_ANIM} ${
              panelsHidden ? "pointer-events-none opacity-0" : "pointer-events-auto opacity-100"
            }`}
          />
          {!isMobile ? (
            <ShowPanelsButton
              onClick={() => setPanelsHidden(false)}
              className={`${PANEL_ANIM} ${
                panelsHidden ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
              }`}
            />
          ) : null}

          {!isMobile ? (
            <>
              <div
                className={`absolute left-16 top-[84px] z-[900] flex min-h-[200px] flex-col gap-[10px] overflow-hidden ${PANEL_ANIM} ${
                  panelsHidden ? "pointer-events-none opacity-0" : "pointer-events-none opacity-100"
                }`}
                style={{ bottom: SIDEBAR_BOTTOM_CLEARANCE, width: panelW }}
              >
                <div
                  className={`flex max-h-full min-h-0 flex-col gap-[10px] ${
                    panelsHidden ? "pointer-events-none" : "pointer-events-auto"
                  }`}
                >
                  {algorithmPanelContent}
                </div>
              </div>

              {result ? (
                <div
                  className={`soft-enter absolute bottom-16 right-16 top-16 z-[900] flex flex-col gap-[10px] overflow-hidden ${PANEL_ANIM} ${
                    panelsHidden ? "opacity-0 [&_*]:pointer-events-none" : "opacity-100"
                  }`}
                  style={{ width: resultPanelW }}
                >
                  {/* Wrapper stays click-through; each card sets pointer-events
                      auto, so the empty area below the cards pans the map. */}
                  <div className="pointer-events-none flex min-h-0 flex-1 flex-col gap-[10px]">
                    {resultsPanelContent}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <>
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
                  elapsedSeconds={elapsedSeconds}
                  progress={progress}
                  stage={stage}
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

        {dataModal}
      </ToastProvider>
    </ErrorBoundary>
  );
}

/** Fires a toast when a run finishes in this session. Driven by `signal`, which
 *  only increments on an actual run (never on restore from storage), so a page
 *  reload of cached results does not toast. */
function RunNotifier({
  signal,
  completedAt,
  kind,
}: {
  signal: number;
  completedAt: number | null;
  kind: RunKind | null;
}) {
  const toast = useToast();
  const seen = useRef(0);

  useEffect(() => {
    if (signal === 0 || signal === seen.current) return;
    seen.current = signal;
    const at = completedAt ? formatDateTimeId(new Date(completedAt).toISOString()) : null;
    toast.success(
      kind === "compare"
        ? `Perbandingan ACS vs VNS selesai${at ? ` · ${at}` : ""}`
        : `Optimasi selesai${at ? ` · ${at}` : ""}`,
    );
  }, [signal, completedAt, kind, toast]);

  return null;
}

function ShowPanelsButton({
  onClick,
  className = "",
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Tampilkan panel"
      className={`absolute left-16 top-16 z-[1000] inline-flex cursor-pointer items-center gap-[6px] rounded-lg border border-frost bg-pure-white px-[12px] py-8 text-[12px] font-bold tracking-[-0.1px] text-midnight-ink hover:bg-frost ${className}`.trim()}
    >
      <PanelsTopLeft size={15} strokeWidth={2} />
      Tampilkan Panel
    </button>
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
