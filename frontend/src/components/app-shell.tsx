"use client";

import { useCallback, useState } from "react";

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
import { MapCanvas } from "./map/map-container";
import { MobileDataLayerDock } from "./map/mobile-data-layer-dock";
import { SiLegend } from "./map/si-legend";
import { MobileRunBar } from "./mobile-run-bar";
import { PanelOverlay } from "./panel-overlay";
import { ResultsDock } from "./results-dock";
import { SplashScreen } from "./splash-screen";

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
 * (layers-collapsed) state: compass + zoom + data counts + collapsed layer
 * toggle. When the layer panel is expanded LeftPanel grows upward past this
 * line, but LeftPanel's higher z-index (1000 > 900) means it cleanly covers
 * the sidebar's bottom for the duration — an acceptable, user-initiated
 * transient. If LeftPanel's resting content changes, re-measure and update. */
const SIDEBAR_BOTTOM_CLEARANCE = 280;

export function AppShell() {
  const bp = useBreakpoint();
  const [showSplash, setShowSplash] = useState(true);
  const [mode, setMode] = useState<AppMode>("simple");
  const [overlays, setOverlays] =
    useState<Record<OverlayLayerId, boolean>>(INITIAL_OVERLAYS);
  const [baseMap, setBaseMap] = useState<BaseMapId>("standard");
  const [highlightVehicleId, setHighlightVehicleId] = useState<string | null>(
    null,
  );
  const [focusedRoute, setFocusedRoute] = useState<RouteOut | null>(null);
  const [previewDataset, setPreviewDataset] = useState<DatasetKey | null>(null);

  const [mobilePanel, setMobilePanel] = useState<
    "none" | "algorithm" | "results"
  >("none");

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

  function setOverlay(id: OverlayLayerId, visible: boolean) {
    setOverlays((prev) => ({ ...prev, [id]: visible }));
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
    run(algoCfg.buildRunRequest());
    if (isMobile) setMobilePanel("none");
  }

  function handleCompare() {
    setFocusedRoute(null);
    runComparison();
    if (isMobile) setMobilePanel("none");
  }

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
      />
    </>
  ) : null;

  return (
    <ErrorBoundary>
      {showSplash && <SplashScreen onDismiss={() => setShowSplash(false)} />}

      <div
        className="relative h-screen w-screen overflow-hidden"
        style={{ background: "var(--color-mist)" }}
        aria-hidden={showSplash}
      >
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
              routes={result?.routes ?? []}
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
              style={{
                position: "absolute",
                top: 84,
                left: 16,
                bottom: SIDEBAR_BOTTOM_CLEARANCE,
                width: panelW,
                zIndex: 900,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                pointerEvents: "none",
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  pointerEvents: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {algorithmPanelContent}
              </div>
            </div>

            {/* Right panel — the container has a definite height (top/bottom
                anchored) and does NOT scroll itself. The summary dock inside
                stays pinned (flexShrink:0); only the route-details dock scrolls
                (flex:1 + overflowY:auto in results-dock.tsx). */}
            {result ? (
              <div
                style={{
                  position: "absolute",
                  top: 16,
                  right: 16,
                  bottom: 16,
                  width: resultPanelW,
                  zIndex: 900,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  pointerEvents: "none",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    pointerEvents: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    flex: 1,
                    minHeight: 0,
                  }}
                >
                  {resultsPanelContent}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            {/* ── Mobile: single flex-stacked bottom dock ──
                One column, one `gap` — spacing between every dock (result
                peek bar, severity legend, data/layer dock, run bar) is
                uniform and non-overlapping regardless of content height.
                The algorithm run bar is the primary action, so it sits last
                (bottom-most, within thumb reach). */}
            <div
              style={{
                position: "absolute",
                left: 16,
                right: 16,
                bottom: 16,
                zIndex: 950,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                pointerEvents: "none",
              }}
            >
              {result ? (
                <ResultPeekBar
                  objectiveZ={result.objective_z}
                  onOpen={() => setMobilePanel("results")}
                />
              ) : null}

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

            {/* Settings overlay — advanced params, compare, reset. Optional,
                not required to run a default optimization. */}
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
    </ErrorBoundary>
  );
}

function ResultPeekBar({
  objectiveZ,
  onOpen,
}: {
  objectiveZ: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        pointerEvents: "auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        background: "var(--color-pure-white)",
        border: "1px solid var(--color-frost)",
        borderRadius: "var(--radius-lg)",
        padding: "10px 14px",
        cursor: "pointer",
        fontFamily: "var(--font-manrope)",
        transition: "background 0.15s ease, border-color 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--color-mist)";
        e.currentTarget.style.borderColor = "var(--color-smoke)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--color-pure-white)";
        e.currentTarget.style.borderColor = "var(--color-frost)";
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: "var(--color-slate)",
          fontWeight: "var(--font-weight-semibold)",
        }}
      >
        Hasil Optimasi
      </span>
      <span
        style={{
          fontSize: 12,
          color: "var(--color-indigo-ink)",
          fontWeight: "var(--font-weight-bold)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        Z = {objectiveZ.toFixed(1)} · Lihat Detail →
      </span>
    </button>
  );
}

function MapStatusPlaceholder({
  loading,
  error,
}: {
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="text-center px-6 max-w-md">
        <p
          style={{
            fontSize: 20,
            color: "var(--color-midnight-ink)",
            fontWeight: "var(--font-weight-bold)",
            letterSpacing: "-0.2px",
          }}
        >
          {loading
            ? "Memuat data peta..."
            : error
              ? "Gagal memuat data"
              : "Menunggu data"}
        </p>
        {error ? (
          <p
            className="mt-2"
            style={{
              fontSize: 13,
              color: "var(--color-steel)",
              fontWeight: "var(--font-weight-medium)",
              lineHeight: 1.5,
            }}
          >
            {error}
            <br />
            <span style={{ color: "var(--color-slate)" }}>
              Pastikan backend berjalan di{" "}
              <code>http://localhost:8000</code>.
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
