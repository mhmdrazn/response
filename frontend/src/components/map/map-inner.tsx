"use client";

import maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  MAP_BOUNDS,
  MAX_ZOOM,
  MIN_ZOOM,
  basemapBackground,
  basemapStyle,
} from "../../lib/basemap-style";
import { trafficTilesConfigured } from "../../lib/google-traffic";
import {
  DEFAULT_ZOOM,
  SURABAYA_CENTER,
  type BaseMapId,
  type OverlayLayerId,
} from "../../lib/map-constants";
import type { DatasetKey } from "../data-table-modal";
import type {
  AppLayout,
  Depot,
  Faskes,
  FloodPoint,
  IntermediateFacility,
  MapSelection,
  RouteOut,
} from "../../types";
import { ChoroplethLayer } from "./choropleth-layer";
import { ChoroplethLegend } from "./choropleth-legend";
import { DepotMarkers } from "./depot-markers";
import { DraftMarker } from "./draft-marker";
import { FaskesMarkers } from "./faskes-markers";
import { FloodMarkers } from "./flood-markers";
import { IfMarkers } from "./if-markers";
import { LeftPanel } from "./left-panel";
import { MapContext, useMap, type MapContextValue } from "./map-context";
import { MapControls } from "./map-controls";
import { TrafficLayer, type TrafficStatusState } from "./traffic-layer";
import { TrafficLegend } from "./traffic-legend";
import { MapLoading } from "./map-loading";
import { PickBanner } from "./pick-banner";
import { PickLayer } from "./pick-layer";
import { RouteDecorators } from "./route-decorators";
import { RoutePolylines } from "./route-polylines";
import { useThreeD } from "./use-three-d";

export interface MapInnerProps {
  floods: FloodPoint[];
  depots: Depot[];
  ifs: IntermediateFacility[];
  faskes: Faskes[];
  overlays: Record<OverlayLayerId, boolean>;
  setOverlay: (id: OverlayLayerId, visible: boolean) => void;
  baseMap: BaseMapId;
  setBaseMap: (id: BaseMapId) => void;
  routes: RouteOut[];
  highlightVehicleId: string | null;
  setHighlightVehicleId: (id: string | null) => void;
  focusedRoute: RouteOut | null;
  onPreviewData: (key: DatasetKey) => void;
  isMobile?: boolean;
  /** Route animation on/off — controlled from the results panel toggle. */
  animating?: boolean;
  /** "fullscreen": map fills the viewport with floating panels (default).
   *  "embedded": map is a card in the windowed dashboard; the layer/data
   *  controls live in the sidebar, so only zoom + legends stay on the map. */
  variant?: "fullscreen" | "embedded";
  onReloadData?: () => void;
  reloadingData?: boolean;
  scenario?: string;
  /** Hide all floating chrome (controls, docks, legends) for a full-map view. */
  hideChrome?: boolean;
  /** Marker whose detail panel is open, and the click handler to open one. */
  selection?: MapSelection | null;
  onSelect?: (selection: MapSelection) => void;
  /** Phone only: extra square buttons stacked under the zoom controls. */
  mobileTools?: ReactNode;
  /** Phone only: fade the tool column out, e.g. while a detail sheet covers the map. */
  mobileToolsHidden?: boolean;
  /** Fullscreen only: a dock stacked under the data dock in the left column. */
  extraDock?: ReactNode;
  /** True while the next click on the map should place a new flood point. */
  picking?: boolean;
  onPick?: (lat: number, lon: number) => void;
  onCancelPick?: () => void;
  /** The point being added, shown as a draggable pin. */
  draftPoint?: { lat: number; lon: number } | null;
  onMoveDraft?: (lat: number, lon: number) => void;
  /** Fullscreen only: gap in px between the map buttons and the left edge, to clear the left panels. */
  controlsLeft?: number;
  /** Current page layout and the switch to the other one (a button on the map). */
  layout?: AppLayout;
  onToggleLayout?: () => void;
}

function FitBounds({ route }: { route: RouteOut | null }) {
  const map = useMap();
  useEffect(() => {
    if (!route || route.polyline.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const [la, lo] of route.polyline) bounds.extend([lo, la]);
    map.fitBounds(bounds, { padding: 40, duration: 600, maxZoom: 16 });
  }, [route, map]);
  return null;
}

/**
 * MapLibre only follows the window, so follow the container as it resizes. Resizing
 * the canvas clears it; drawing again in the same frame keeps it from flashing blank.
 */
function ResizeSync() {
  const map = useMap();
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      map.resize();
      map.redraw();
    });
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

export function MapInner({
  floods,
  depots,
  ifs,
  faskes,
  overlays,
  setOverlay,
  baseMap,
  setBaseMap,
  routes,
  highlightVehicleId,
  setHighlightVehicleId,
  focusedRoute,
  onPreviewData,
  isMobile = false,
  animating = false,
  variant = "fullscreen",
  onReloadData,
  reloadingData,
  scenario,
  hideChrome = false,
  selection,
  onSelect,
  mobileTools,
  mobileToolsHidden = false,
  extraDock,
  picking = false,
  onPick,
  onCancelPick,
  draftPoint,
  onMoveDraft,
  layout,
  onToggleLayout,
  controlsLeft = 16,
}: MapInnerProps) {
  const selectedOf = (kind: MapSelection["kind"]) =>
    selection?.kind === kind ? selection.id : null;

  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [styleVersion, setStyleVersion] = useState(0);
  const [overlayGone, setOverlayGone] = useState(false);
  const [trafficStatus, setTrafficStatus] = useState<TrafficStatusState>({ kind: "loading" });
  const showTraffic = overlays.traffic && trafficTilesConfigured();
  // Drop the loading cover once its fade-out has had time to finish.
  useEffect(() => {
    if (!map) return;
    const t = window.setTimeout(() => setOverlayGone(true), 650);
    return () => window.clearTimeout(t);
  }, [map]);
  const threeD = useThreeD(map, styleVersion);
  const threeDActive = useRef(false);
  useEffect(() => {
    threeDActive.current = threeD.active;
  }, [threeD.active]);
  const loadedBase = useRef<BaseMapId>(baseMap);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const m = new maplibregl.Map({
      container,
      style: basemapStyle(loadedBase.current, false),
      center: SURABAYA_CENTER,
      zoom: DEFAULT_ZOOM,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      maxBounds: MAP_BOUNDS,
      maxPitch: 70,
      attributionControl: false,
      // Keep the canvas sharp on high-density screens without going overboard.
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    });
    m.on("style.load", () => setStyleVersion((v) => v + 1));
    m.once("load", () => setMap(m));
    return () => {
      setMap(null);
      m.remove();
    };
  }, []);

  // A new basemap is a new style; overlays re-add their layers on styleVersion.
  useEffect(() => {
    if (!map || loadedBase.current === baseMap) return;
    loadedBase.current = baseMap;
    map.setStyle(basemapStyle(baseMap, threeDActive.current), { diff: false });
  }, [map, baseMap]);

  const ctx = useMemo<MapContextValue | null>(
    () => (map ? { map, styleVersion, threeD, layout, onToggleLayout } : null),
    [map, styleVersion, threeD, layout, onToggleLayout],
  );

  return (
    <div className="relative h-full w-full" style={{ background: basemapBackground(baseMap) }}>
      <div ref={containerRef} className="h-full w-full" />
      {/* Covers the canvas until the first frame is ready, then fades away. */}
      {!overlayGone ? (
        <div
          className={`absolute inset-0 z-[1100] transition-opacity duration-500 ease-out ${
            map ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          <MapLoading />
        </div>
      ) : null}
      {ctx ? (
        <MapContext.Provider value={ctx}>
          {/* Choropleth sits directly above the basemap so markers/routes overlay it. */}
          {overlays.choropleth ? <ChoroplethLayer floods={floods} /> : null}
          {showTraffic ? <TrafficLayer onStatus={setTrafficStatus} /> : null}

          {overlays.floods ? (
            <FloodMarkers
              points={floods}
              selectedId={selectedOf("flood")}
              onSelect={(id) => onSelect?.({ kind: "flood", id })}
            />
          ) : null}
          {overlays.depots ? (
            <DepotMarkers
              depots={depots}
              selectedId={selectedOf("depot")}
              onSelect={(id) => onSelect?.({ kind: "depot", id })}
            />
          ) : null}
          {overlays.ifs ? (
            <IfMarkers
              ifs={ifs}
              selectedId={selectedOf("if")}
              onSelect={(id) => onSelect?.({ kind: "if", id })}
            />
          ) : null}
          {overlays.faskes ? (
            <FaskesMarkers
              faskes={faskes}
              selectedId={selectedOf("faskes")}
              onSelect={(id) => onSelect?.({ kind: "faskes", id })}
            />
          ) : null}

          {routes.length > 0 ? (
            <>
              <RoutePolylines
                routes={routes}
                highlightId={highlightVehicleId}
                selectedId={selectedOf("route")}
                onHover={setHighlightVehicleId}
                onSelect={(id) => onSelect?.({ kind: "route", id })}
              />
              <RouteDecorators
                routes={routes}
                highlightId={highlightVehicleId}
                animating={animating}
              />
            </>
          ) : null}

          <FitBounds route={focusedRoute} />
          <ResizeSync />
          <PickLayer active={picking} onPick={(lat, lon) => onPick?.(lat, lon)} />
          {draftPoint ? (
            <DraftMarker
              lat={draftPoint.lat}
              lon={draftPoint.lon}
              onMove={(la, lo) => onMoveDraft?.(la, lo)}
            />
          ) : null}
          {picking ? (
            <PickBanner onCancel={() => onCancelPick?.()} belowNavbar={variant === "fullscreen"} />
          ) : null}

          {isMobile && showTraffic ? (
            <div className="pointer-events-none absolute top-[78px] left-12 z-[1000]">
              <TrafficLegend status={trafficStatus} />
            </div>
          ) : null}

          {isMobile ? (
            <div
              className={`pointer-events-none absolute top-[78px] right-12 z-[1000] flex flex-col items-end gap-8 transition-opacity duration-300 ease-out ${
                mobileToolsHidden ? "opacity-0 [&_*]:pointer-events-none" : "opacity-100"
              }`}
            >
              <MapControls orientation="vertical" />
              {mobileTools}
            </div>
          ) : null}

          {/* --- Fullscreen chrome: floating controls + docks over the map.
             Kept mounted and faded via hideChrome so it animates in/out. --- */}
          {!isMobile && variant === "fullscreen" ? (
            <>
              {/* Legends sit bottom left of the map, just right of the left docks. */}
              {overlays.choropleth || showTraffic ? (
                <div
                  style={{ left: controlsLeft }}
                  className={`pointer-events-none absolute bottom-16 z-[1000] flex flex-col items-start gap-8 transition-[left,opacity] duration-300 ease-out ${
                    hideChrome ? "opacity-0 [&_*]:pointer-events-none" : "opacity-100"
                  }`}
                >
                  {showTraffic ? <TrafficLegend status={trafficStatus} /> : null}
                  {overlays.choropleth ? <ChoroplethLegend /> : null}
                </div>
              ) : null}

              {/* Map buttons: top left of the map, as in the dashboard map, just right of the left panels. */}
              <div
                style={{ left: controlsLeft }}
                className={`pointer-events-none absolute top-[84px] z-[1000] transition-[left,opacity] duration-300 ease-out ${
                  hideChrome ? "opacity-0 [&_*]:pointer-events-none" : "opacity-100"
                }`}
              >
                <MapControls orientation="vertical" />
              </div>

              <LeftPanel
                floodCount={floods.length}
                depotCount={depots.length}
                ifCount={ifs.length}
                faskesCount={faskes.length}
                overlays={overlays}
                setOverlay={setOverlay}
                baseMap={baseMap}
                setBaseMap={setBaseMap}
                onPreviewData={onPreviewData}
                onReloadData={onReloadData}
                reloadingData={reloadingData}
                scenario={scenario}
                extraDock={extraDock}
                hidden={hideChrome}
              />
            </>
          ) : null}

          {/* --- Embedded (windowed dashboard): only zoom + legends on the map --- */}
          {!isMobile && variant === "embedded" ? (
            <>
              <div className="pointer-events-none absolute top-12 left-12 z-[1000]">
                <MapControls orientation="vertical" />
              </div>
              <div className="pointer-events-none absolute right-16 bottom-16 z-[800] flex flex-col items-end gap-8">
                {showTraffic ? <TrafficLegend status={trafficStatus} /> : null}
                {overlays.choropleth ? <ChoroplethLegend /> : null}
              </div>
            </>
          ) : null}
        </MapContext.Provider>
      ) : null}
    </div>
  );
}
