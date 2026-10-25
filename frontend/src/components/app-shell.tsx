"use client";

import { PanelsTopLeft } from "lucide-react";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { useAlgorithmConfig } from "../hooks/use-algorithm-config";
import { useClosures } from "../hooks/use-closures";
import { useFleetConfig } from "../hooks/use-fleet-config";
import { useBreakpoint } from "../hooks/use-breakpoint";
import { usePersistentState } from "../hooks/use-persistent-state";
import { useMapData } from "../hooks/use-map-data";
import { useOptimization } from "../hooks/use-optimization";
import { useFadeThrough } from "../hooks/use-fade-through";
import { usePresence } from "../hooks/use-presence";
import { usePriority } from "../hooks/use-priority";
import { BASE_MAP_LAYERS, type BaseMapId, type OverlayLayerId } from "../lib/map-constants";
import { OVERLAY_LAYERS } from "../lib/map-constants";
import { api } from "../lib/api";
import { MAX_SHIFT_MIN, MAX_UNITS, settingFor } from "../lib/fleet";
import { buildSignature, changedGroups, hashDataset } from "../lib/run-signature";
import type {
  AppLayout,
  AppMode,
  Depot,
  IntermediateFacility,
  MapSelection,
  RouteOut,
  ScenarioMeta,
  Suggestion,
  TrafficStatus,
} from "../types";
import { AnimatedHeight } from "./animated-height";
import { ConfirmDialog } from "./confirm-dialog";
import { ErrorBoundary } from "./error-boundary";
import { AlgorithmPanel } from "./sidebar/algorithm-panel";
import { DataTableModal, type DatasetKey } from "./data-table-modal";
import { FloatingNavbar } from "./floating-navbar";
import { WindowedLayout } from "./layouts/windowed-layout";
import { ConfigDialog, type ConfigTab } from "./manage/config-dialog";
import { ImportFloodsDialog } from "./manage/import-floods-dialog";
import { ManageDock } from "./manage/manage-dock";
import { AddFloodPanel } from "./sidebar/add-flood-panel";
import { StaleBanner } from "./sidebar/stale-banner";
import { ClinicDetailPanel } from "./sidebar/clinic-detail-panel";
import { DepotDetailPanel } from "./sidebar/depot-detail-panel";
import { FloodDetailPanel } from "./sidebar/flood-detail-panel";
import { OutletDetailPanel } from "./sidebar/outlet-detail-panel";
import { RouteDetailPanel } from "./sidebar/route-detail-panel";
import { ChoroplethLegend } from "./map/choropleth-legend";
import { MapCanvas } from "./map/map-container";
import { DataDock } from "./map/data-dock";
import { MapLayerDock } from "./map/map-layer-dock";
import { MapLoading } from "./map/map-loading";
import { MapLegend } from "./map/map-legend";
import { MobileMapTools, type MobileToolId } from "./map/mobile-map-tools";
import { MobileRunBar } from "./mobile-run-bar";
import { PanelOverlay } from "./panel-overlay";
import { ResultsDock } from "./results-dock";
import { ToastProvider, useToast } from "./toast";
import type { RunKind } from "../hooks/use-optimization";
import { formatDateTimeId } from "../lib/format";
import { readJSON, readStringSet, writeJSON, writeStringSet } from "../lib/storage";

// Only shown after a two-algorithm comparison; its chart library loads then.
const ComparisonPanel = dynamic(
  () => import("./sidebar/comparison-panel").then((m) => m.ComparisonPanel),
  { ssr: false },
);

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
/** How long the outgoing detail panel takes to fade before the next one comes in. */
const DETAIL_SWAP_OUT_MS = 160;

function selectionKey(s: MapSelection): string {
  return `${s.kind}:${s.id}`;
}

const NO_DEPOTS: Depot[] = [];
const NO_IFS: IntermediateFacility[] = [];

const HIDDEN_ROUTES_STORAGE_KEY = "floodroute:hidden-routes:v1";
const LAYOUT_STORAGE_KEY = "floodroute:layout:v1";
const BASEMAP_STORAGE_KEY = "floodroute:basemap:v1";
const TRAFFIC_ROUTING_STORAGE_KEY = "floodroute:traffic-routing:v1";

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
  // The basemap last used comes back on the next visit.
  const [savedBaseMap, setBaseMap] = usePersistentState<string>(BASEMAP_STORAGE_KEY, "standard");
  const baseMap: BaseMapId =
    savedBaseMap in BASE_MAP_LAYERS ? (savedBaseMap as BaseMapId) : "standard";
  const [highlightVehicleId, setHighlightVehicleId] = useState<string | null>(null);
  const [focusedRoute, setFocusedRoute] = useState<RouteOut | null>(null);
  const [selection, setSelection] = useState<MapSelection | null>(null);
  // Lets the detail panel animate out before it unmounts.
  const { shown: presentSelection, visible: detailVisible } = usePresence(selection);
  // Switching from one detail to another fades the old out, then the new in.
  const { shown: shownSelection, leaving: detailLeaving } = useFadeThrough(
    presentSelection,
    selectionKey,
    DETAIL_SWAP_OUT_MS,
  );
  const [animating, setAnimating] = useState(false);
  const [panelsHidden, setPanelsHidden] = useState(false);
  const [previewDataset, setPreviewDataset] = useState<DatasetKey | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioMeta[]>([]);
  const [scenario, setScenario] = useState<string | undefined>(undefined);
  const [configTab, setConfigTab] = useState<ConfigTab | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  // Adding a flood point: waiting for a map click, then the point awaiting its details.
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<{ lat: number; lon: number } | null>(null);

  const [mobilePanel, setMobilePanel] = useState<"none" | "algorithm" | "results" | MobileToolId>(
    "none",
  );

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

  const priorityCfg = usePriority();
  const { data, loading, error: dataError, reload } = useMapData(scenario, priorityCfg.weights);
  const fleetCfg = useFleetConfig(data?.depots ?? NO_DEPOTS);
  const closures = useClosures(data?.depots ?? NO_DEPOTS, data?.ifs ?? NO_IFS);
  // Plan with live traffic (TomTom): remembered between visits, offered only on the
  // blank canvas and only when the backend has a key. The study areas are recorded
  // events and always plan on the precomputed OSRM times.
  const [trafficWanted, setTrafficWanted] = usePersistentState<boolean>(
    TRAFFIC_ROUTING_STORAGE_KEY,
    false,
  );
  const [trafficStatus, setTrafficStatus] = useState<TrafficStatus | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .getTrafficStatus()
      .then((st) => {
        if (alive) setTrafficStatus(st);
      })
      .catch(() => {
        /* older backend: no traffic routing */
      });
    return () => {
      alive = false;
    };
  }, []);
  const trafficAvailable = trafficStatus?.configured ?? false;
  const isCanvas = scenarios.find((sc) => sc.id === scenario)?.kind === "canvas";
  const runExtras = {
    fleet: fleetCfg.payload,
    severity_weights: priorityCfg.weights,
    use_traffic: isCanvas && trafficWanted && trafficAvailable,
    ...closures.payload,
  };
  const {
    result,
    periods,
    activePeriod,
    setActivePeriod,
    runNextPeriod,
    runRemainingPeriods,
    comparison,
    isLoading,
    elapsedSeconds,
    progress,
    stage,
    error: optError,
    completedAt,
    signature: resultSignature,
    lastRunKind,
    runSignal,
    run,
    runComparison,
    reset,
  } = useOptimization();
  const algoCfg = useAlgorithmConfig();

  // What a run started now would be computed from. Compared with what the result on
  // screen was computed from, it says whether that result is out of date.
  const dataKey = useMemo(() => (data ? hashDataset(data) : null), [data]);
  const currentSignature =
    dataKey === null
      ? null
      : buildSignature({
          ...runExtras,
          acsParams: algoCfg.acsParams,
          vnsParams: algoCfg.vnsParams,
          budgetS: algoCfg.budgetS,
          dataKey,
        });
  const staleGroups =
    result && resultSignature && currentSignature
      ? changedGroups(resultSignature, currentSignature)
      : [];
  const stale = staleGroups.length > 0;

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
          preChoroplethBaseMap.current = prev in BASE_MAP_LAYERS ? (prev as BaseMapId) : "standard";
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
  const dropRouteSelection = () => setSelection((prev) => (prev?.kind === "route" ? null : prev));

  function handleRun() {
    dropRouteSelection();
    setFocusedRoute(null);
    setHiddenRoutes(new Set());
    setAnimating(false);
    run(algoCfg.buildRunRequest(runExtras), scenario, currentSignature ?? undefined);
    if (isMobile) setMobilePanel("none");
  }

  function handleNextPeriod(all: boolean) {
    dropRouteSelection();
    setFocusedRoute(null);
    setHiddenRoutes(new Set());
    setAnimating(false);
    const req = algoCfg.buildRunRequest(runExtras);
    if (all) runRemainingPeriods(req, scenario, currentSignature ?? undefined);
    else runNextPeriod(req, scenario, currentSignature ?? undefined);
    if (isMobile) setMobilePanel("none");
  }

  /** Change the fleet as a suggestion says; the person runs the optimisation again. */
  function applySuggestion(s: Suggestion): string {
    const current = settingFor(fleetCfg.settings, s.depot_id, fleetCfg.defaults);
    let next = current;
    let said: string;
    if (s.kind === "add_unit") {
      const [small, large] = fleetCfg.settings.tanks;
      const slot = s.capacity_l === small && s.capacity_l !== large ? 0 : 1;
      const units: [number, number] = [...current.units];
      units[slot] = Math.min(MAX_UNITS, units[slot] + 1);
      next = { ...current, units };
      said = `Ditambahkan 1 unit di ${s.depot_name}.`;
    } else {
      const base = current.minutes ?? fleetCfg.defaults.operating_minutes;
      const minutes = Math.min(MAX_SHIFT_MIN, Math.round(base + (s.extra_minutes ?? 60)));
      next = { ...current, minutes };
      said = `Jam operasional ${s.depot_name} menjadi ${(minutes / 60).toFixed(1).replace(".", ",")} jam.`;
    }
    fleetCfg.setSettings({
      ...fleetCfg.settings,
      depots: { ...fleetCfg.settings.depots, [s.depot_id]: next },
    });
    return said;
  }

  function handleCompare() {
    dropRouteSelection();
    setFocusedRoute(null);
    setHiddenRoutes(new Set());
    setAnimating(false);
    runComparison(undefined, scenario, algoCfg.budgetS, runExtras, currentSignature ?? undefined);
    if (isMobile) setMobilePanel("none");
  }

  // Planning on live traffic shows the traffic it plans on.
  function setTrafficRouting(on: boolean) {
    setTrafficWanted(on);
    if (on) setOverlay("traffic", true);
  }

  function handleScenarioChange(id: string) {
    if (id === scenario) return;
    // Opening the canvas with traffic planning already on: show the traffic too.
    const toCanvas = scenarios.find((sc) => sc.id === id)?.kind === "canvas";
    if (toCanvas && trafficWanted && trafficAvailable) setOverlay("traffic", true);
    setScenario(id); // useMapData refetches on change
    reset(); // optimization results are per-scenario
    setSelection(null);
    setPicking(false);
    setFocusedRoute(null);
    setHighlightVehicleId(null);
    setHiddenRoutes(new Set());
    setAnimating(false);
  }

  const visibleRoutes = (result?.routes ?? []).filter((r) => !hiddenRoutes.has(r.vehicle_id));

  // The blank canvas: an empty study area of its own, points placed by hand.
  const [confirmReset, setConfirmReset] = useState(false);
  async function resetCanvas() {
    setConfirmReset(false);
    if (!scenario) return;
    try {
      await api.resetScenario(scenario);
    } finally {
      reset();
      setSelection(null);
      setPicking(false);
      setFocusedRoute(null);
      setHighlightVehicleId(null);
      setHiddenRoutes(new Set());
      setAnimating(false);
      reload();
    }
  }

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
      traffic={
        isCanvas
          ? {
              available: trafficAvailable,
              enabled: trafficWanted && trafficAvailable,
              onChange: setTrafficRouting,
            }
          : undefined
      }
      canvas={
        isCanvas
          ? {
              count: data?.floods.length ?? 0,
              onAddPoint: startPick,
              onImport: () => {
                setMobilePanel("none");
                setImportOpen(true);
              },
              onReset: () => setConfirmReset(true),
            }
          : undefined
      }
      closures={{
        depots: closures.disabledDepots.size,
        ifs: closures.closedIfs.size,
        onClear: closures.clear,
      }}
      onRun={handleRun}
      stale={stale}
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
      <StaleBanner groups={staleGroups} onRerun={handleRun} isLoading={isLoading} />
      {comparison ? <ComparisonPanel comparison={comparison} /> : null}
      <ResultsDock
        result={result}
        mode={mode}
        completedAt={completedAt}
        severity={data?.severity ?? null}
        highlightVehicleId={highlightVehicleId}
        onHoverRoute={setHighlightVehicleId}
        onFocusRoute={(route) => {
          // Picking a route in the list frames it on the map and opens its detail, as a click on the map does.
          setFocusedRoute(route);
          setSelection({ kind: "route", id: route.vehicle_id });
        }}
        hiddenVehicleIds={hiddenRoutes}
        onToggleVehicleVisibility={toggleRouteVisibility}
        animating={animating}
        onToggleAnimating={() => setAnimating((v) => !v)}
        periods={periods}
        activePeriod={activePeriod}
        onSelectPeriod={(i) => {
          setActivePeriod(i);
          setFocusedRoute(null);
          setHighlightVehicleId(null);
          setHiddenRoutes(new Set());
        }}
        onNextPeriod={() => handleNextPeriod(false)}
        onRemainingPeriods={() => handleNextPeriod(true)}
        isLoading={isLoading}
        onSelectFlood={(id) => setSelection({ kind: "flood", id })}
        onApplySuggestion={applySuggestion}
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
      case "draft": {
        if (!draft) return null;
        return (
          <AddFloodPanel
            point={draft}
            floods={data.floods}
            scenario={scenario}
            onSaved={(created) => {
              reload();
              setDraft(null);
              setSelection({ kind: "flood", id: created.id });
            }}
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

  // Swapping one detail for another: the old one fades out in place, then the
  // new one fades in while the height eases to its size.
  const renderDetail = (variant: "fullscreen" | "embedded"): ReactNode => {
    const panel = renderDetailPanel(variant);
    if (!panel || !shownSelection) return null;
    return (
      <AnimatedHeight>
        <div
          key={selectionKey(shownSelection)}
          className={`detail-swap ${detailLeaving ? "detail-swap-out" : ""}`}
        >
          {panel}
        </div>
      </AnimatedHeight>
    );
  };

  // Bottom of the map. Fullscreen fills the gap between the left dock stack and
  // the results column, or to the right edge when there are none. The
  // windowed layout does not overlay the map at all: its panel is a row under it.
  const detailPanelInset = (extra: { isMobile: boolean }) => {
    if (extra.isMobile) return { left: 12, right: 12, bottom: 12 };
    return {
      left: panelW + 32,
      right: result ? resultPanelW + 32 : 16,
      bottom: 16,
    };
  };

  const detailRow = renderDetail("embedded");

  function startPick() {
    setMobilePanel("none");
    setSelection(null);
    setPicking(true);
  }

  function handlePick(lat: number, lon: number) {
    setPicking(false);
    setDraft({ lat, lon });
    setSelection({ kind: "draft", id: "draft" });
  }

  const manageDock = (
    <ManageDock
      defaultOpen
      fleetCustom={fleetCfg.custom}
      fleetSummary={fleetCfg.summary}
      priority={priorityCfg.priority}
      onPickOnMap={startPick}
      onImportCsv={() => {
        setMobilePanel("none");
        setImportOpen(true);
      }}
      onOpenConfig={(tab) => {
        setMobilePanel("none");
        setConfigTab(tab);
      }}
    />
  );

  const dialogs = (
    <>
      <ConfirmDialog
        open={confirmReset}
        title="Kosongkan kanvas?"
        description="Semua titik genangan yang kamu tambahkan di kanvas ini akan dihapus, beserta hasil optimasinya. Area studi lain tidak berubah."
        confirmLabel="Kosongkan"
        variant="danger"
        onConfirm={() => void resetCanvas()}
        onCancel={() => setConfirmReset(false)}
      />
      <ConfigDialog
        open={configTab !== null}
        tab={configTab ?? "fleet"}
        onClose={() => setConfigTab(null)}
        depots={data?.depots ?? NO_DEPOTS}
        fleet={fleetCfg}
        priority={priorityCfg}
        scenario={scenario}
      />
      <ImportFloodsDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        existing={data?.floods ?? []}
        scenario={scenario}
        onImported={reload}
      />
    </>
  );

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
          closures={closures}
          mobileTools={extra.isMobile ? <MobileMapTools onOpen={setMobilePanel} /> : undefined}
          mobileToolsHidden={detailVisible}
          extraDock={manageDock}
          picking={picking}
          onPick={handlePick}
          onCancelPick={() => setPicking(false)}
          draftPoint={selection?.kind === "draft" ? draft : null}
          onMoveDraft={(lat, lon) => setDraft({ lat, lon })}
          layout={extra.variant === "embedded" ? "windowed" : "fullscreen"}
          controlsLeft={panelsHidden ? 16 : panelW + 26}
          onToggleLayout={
            extra.isMobile
              ? undefined
              : () => changeLayout(extra.variant === "embedded" ? "fullscreen" : "windowed")
          }
          {...extra}
        />
        {floatingDetail ? (
          <div
            className={`pointer-events-none absolute z-[950] flex justify-center transition-[opacity,transform] duration-300 ease-out ${
              panelsHidden || !detailVisible ? "opacity-0 [&_*]:pointer-events-none" : "opacity-100"
            } ${detailVisible ? "translate-y-0" : "translate-y-3"}`}
            style={detailPanelInset(extra)}
          >
            {floatingDetail}
          </div>
        ) : null}
      </>
    ) : (
      <MapLoading error={loading ? null : dataError} />
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
  if (layout === null) return <div className="bg-mist h-screen w-screen" />;

  if (!isMobile && layout === "windowed") {
    return (
      <ErrorBoundary>
        <ToastProvider>
          <RunNotifier signal={runSignal} completedAt={completedAt} kind={lastRunKind} />
          <WindowedLayout
            mode={mode}
            onModeChange={setMode}
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
            manageDock={manageDock}
            mapCard={renderMap({ isMobile: false, variant: "embedded" })}
            detail={detailRow}
            detailOpen={detailVisible}
            results={resultsPanelContent}
            hasResult={result !== null}
          />
          {dataModal}
          {dialogs}
        </ToastProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <RunNotifier signal={runSignal} completedAt={completedAt} kind={lastRunKind} />
        <div className="bg-mist relative h-screen w-screen overflow-hidden">
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
            onHidePanels={!isMobile ? () => setPanelsHidden(true) : undefined}
            className={`${PANEL_ANIM} ${
              panelsHidden
                ? "pointer-events-none opacity-0 [&_*]:pointer-events-none"
                : "pointer-events-auto opacity-100"
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
                className={`absolute top-[84px] left-16 z-[900] flex min-h-[200px] flex-col gap-[10px] overflow-hidden ${PANEL_ANIM} ${
                  panelsHidden ? "pointer-events-none opacity-0" : "pointer-events-none opacity-100"
                }`}
                style={{ bottom: SIDEBAR_BOTTOM_CLEARANCE, width: panelW }}
              >
                <div
                  className={`flex max-h-full min-h-0 flex-col gap-[10px] ${
                    panelsHidden
                      ? "pointer-events-none [&_*]:pointer-events-none"
                      : "pointer-events-auto"
                  }`}
                >
                  {algorithmPanelContent}
                </div>
              </div>

              {result ? (
                <div
                  className={`soft-enter pointer-events-none absolute top-16 right-16 bottom-16 z-[900] flex flex-col gap-[10px] overflow-hidden ${PANEL_ANIM} ${
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
              {/* The bottom stack is only the run bar (and the result peek). Layers, data
                  and the legend live behind the square buttons on the right, and the
                  stack steps aside while a detail sheet is open so nothing overlaps. */}
              <div
                className={`pointer-events-none absolute right-16 bottom-16 left-16 z-[950] flex flex-col gap-8 transition-[opacity,transform] duration-300 ease-out ${
                  detailVisible
                    ? "translate-y-3 opacity-0 [&_*]:pointer-events-none"
                    : "opacity-100"
                }`}
              >
                {stale ? (
                  <StaleBanner
                    compact
                    groups={staleGroups}
                    onRerun={handleRun}
                    isLoading={isLoading}
                  />
                ) : null}
                {result ? (
                  <ResultPeekBar
                    objectiveZ={result.objective_z}
                    onOpen={() => setMobilePanel("results")}
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
                  stale={stale}
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
                open={mobilePanel === "layers"}
                onClose={() => setMobilePanel("none")}
                title="Lapisan Peta"
              >
                <MapLayerDock
                  bare
                  overlays={overlays}
                  setOverlay={setOverlay}
                  baseMap={baseMap}
                  setBaseMap={setBaseMap}
                />
              </PanelOverlay>

              <PanelOverlay
                open={mobilePanel === "data"}
                onClose={() => setMobilePanel("none")}
                title="Data"
              >
                <DataDock
                  bare
                  floodCount={data?.floods.length ?? 0}
                  depotCount={data?.depots.length ?? 0}
                  ifCount={data?.ifs.length ?? 0}
                  faskesCount={data?.faskes.length ?? 0}
                  onPreviewData={(key) => {
                    setMobilePanel("none");
                    handlePreviewData(key);
                  }}
                  onReloadData={reload}
                  reloadingData={loading}
                  scenario={scenario}
                />
              </PanelOverlay>

              <PanelOverlay
                open={mobilePanel === "manage"}
                onClose={() => setMobilePanel("none")}
                title="Kelola"
              >
                <ManageDock
                  bare
                  fleetCustom={fleetCfg.custom}
                  fleetSummary={fleetCfg.summary}
                  priority={priorityCfg.priority}
                  onPickOnMap={startPick}
                  onImportCsv={() => {
                    setMobilePanel("none");
                    setImportOpen(true);
                  }}
                  onOpenConfig={(tab) => {
                    setMobilePanel("none");
                    setConfigTab(tab);
                  }}
                />
              </PanelOverlay>

              <PanelOverlay
                open={mobilePanel === "legend"}
                onClose={() => setMobilePanel("none")}
                title="Legenda"
              >
                <MapLegend />
                {overlays.choropleth ? <ChoroplethLegend /> : null}
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
        {dialogs}
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
      className={`border-frost bg-pure-white text-midnight-ink hover:bg-frost absolute top-16 left-16 z-[1000] inline-flex cursor-pointer items-center gap-[6px] rounded-lg border px-[12px] py-8 text-[12px] font-bold tracking-[-0.1px] ${className}`.trim()}
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
      className="font-manrope border-frost bg-pure-white hover:border-smoke hover:bg-mist pointer-events-auto flex w-full cursor-pointer items-center justify-between rounded-lg border px-[14px] py-[10px] transition-colors"
    >
      <span className="text-slate text-[11px] font-semibold">Hasil Optimasi</span>
      <span className="text-midnight-ink text-[12px] font-bold tabular-nums">
        Z = {objectiveZ.toFixed(1)} · Lihat Detail →
      </span>
    </button>
  );
}
