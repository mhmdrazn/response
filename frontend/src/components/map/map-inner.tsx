"use client";

import type { LatLngBoundsExpression } from "leaflet";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";

import {
  BASE_MAP_LAYERS,
  DEFAULT_ZOOM,
  SURABAYA_CENTER,
  type BaseMapId,
  type OverlayLayerId,
} from "../../lib/map-constants";
import type { DatasetKey } from "../data-table-modal";
import type { Depot, Faskes, FloodPoint, IntermediateFacility, RouteOut } from "../../types";
import { ChoroplethLayer } from "./choropleth-layer";
import { ChoroplethLegend } from "./choropleth-legend";
import { DepotMarkers } from "./depot-markers";
import { FaskesMarkers } from "./faskes-markers";
import { FloodMarkers } from "./flood-markers";
import { IfMarkers } from "./if-markers";
import { LeftPanel } from "./left-panel";
import { MapControls } from "./map-controls";
import { RouteDecorators } from "./route-decorators";
import { RoutePolylines } from "./route-polylines";
import { SiLegend } from "./si-legend";

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
  /** Hide all floating chrome (controls, docks, legends) for a full-map view. */
  hideChrome?: boolean;
}

function FitBounds({ route }: { route: RouteOut | null }) {
  const map = useMap();
  useEffect(() => {
    if (!route || route.polyline.length === 0) return;
    const bounds = L.latLngBounds(
      route.polyline.map(([la, lo]) => L.latLng(la, lo)),
    ) as LatLngBoundsExpression;
    map.flyToBounds(bounds, { padding: [40, 40], duration: 0.6 });
  }, [route, map]);
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
  hideChrome = false,
}: MapInnerProps) {
  const base = BASE_MAP_LAYERS[baseMap];

  return (
    <MapContainer
      center={SURABAYA_CENTER}
      zoom={DEFAULT_ZOOM}
      minZoom={10}
      maxZoom={18}
      zoomControl={false}
      attributionControl={true}
      className="h-full w-full"
    >
      <TileLayer url={base.urlTemplate} attribution={base.attribution} />

      {/* Choropleth sits directly above the basemap so markers/routes overlay it. */}
      {overlays.choropleth ? <ChoroplethLayer floods={floods} /> : null}

      {overlays.floods ? <FloodMarkers points={floods} /> : null}
      {overlays.depots ? <DepotMarkers depots={depots} /> : null}
      {overlays.ifs ? <IfMarkers ifs={ifs} /> : null}
      {overlays.faskes ? <FaskesMarkers faskes={faskes} /> : null}

      {routes.length > 0 ? (
        <>
          <RoutePolylines
            routes={routes}
            highlightId={highlightVehicleId}
            onHover={setHighlightVehicleId}
          />
          <RouteDecorators
            routes={routes}
            highlightId={highlightVehicleId}
            animating={animating}
          />
        </>
      ) : null}

      <FitBounds route={focusedRoute} />

      {isMobile ? (
        <div className="pointer-events-none absolute right-12 top-[78px] z-[1000]">
          <MapControls />
        </div>
      ) : null}

      {/* --- Fullscreen chrome: floating controls + docks over the map --- */}
      {!isMobile && variant === "fullscreen" && !hideChrome ? (
        <>
          {/* Choropleth legend sits on the left, just right of the Data dock. */}
          {overlays.choropleth ? (
            <div className="pointer-events-none absolute bottom-16 left-[364px] z-[1000]">
              <ChoroplethLegend />
            </div>
          ) : null}

          {routes.length === 0 ? (
            <div className="pointer-events-none absolute bottom-24 right-16 z-[800]">
              <SiLegend inline />
            </div>
          ) : null}

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
          />
        </>
      ) : null}

      {/* --- Embedded (windowed dashboard): only zoom + legends on the map --- */}
      {!isMobile && variant === "embedded" ? (
        <>
          <div className="pointer-events-none absolute bottom-16 left-16 z-[1000]">
            <MapControls />
          </div>
          <div className="pointer-events-none absolute bottom-16 right-16 z-[800] flex flex-col items-end gap-8">
            {overlays.choropleth ? <ChoroplethLegend /> : null}
            {routes.length === 0 ? <SiLegend inline /> : null}
          </div>
        </>
      ) : null}
    </MapContainer>
  );
}
