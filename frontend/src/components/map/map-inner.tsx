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
import { DepotMarkers } from "./depot-markers";
import { FaskesMarkers } from "./faskes-markers";
import { FloodMarkers } from "./flood-markers";
import { IfMarkers } from "./if-markers";
import { LeftPanel } from "./left-panel";
import { MapControls } from "./map-controls";
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
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer url={base.urlTemplate} attribution={base.attribution} />

      {overlays.floods ? <FloodMarkers points={floods} /> : null}
      {overlays.depots ? <DepotMarkers depots={depots} /> : null}
      {overlays.ifs ? <IfMarkers ifs={ifs} /> : null}
      {overlays.faskes ? <FaskesMarkers faskes={faskes} /> : null}

      {routes.length > 0 ? (
        <RoutePolylines
          routes={routes}
          highlightId={highlightVehicleId}
          onHover={setHighlightVehicleId}
        />
      ) : null}

      <FitBounds route={focusedRoute} />

      {/* MapControls at top-right on mobile (extracted from LeftPanel).
          top:78 clears the compact FloatingNavbar (top:12 + ~46px tall)
          with a visible gap instead of nearly touching it. */}
      {isMobile ? (
        <div
          style={{
            position: "absolute",
            top: 78,
            right: 12,
            zIndex: 1000,
            pointerEvents: "none",
          }}
        >
          <MapControls />
        </div>
      ) : null}

      {/* SI legend: hide on mobile, hide when routes shown (data in results panel) */}
      {!isMobile && routes.length === 0 ? <SiLegend /> : null}

      {/* Mobile renders its own flex-stacked data/layer dock in app-shell.tsx
          instead, to guarantee consistent spacing with the other mobile docks. */}
      {!isMobile ? (
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
        />
      ) : null}
    </MapContainer>
  );
}
