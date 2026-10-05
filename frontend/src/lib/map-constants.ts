import type { LatLngExpression } from "leaflet";

export const SURABAYA_CENTER: LatLngExpression = [-7.2575, 112.7521];
export const DEFAULT_ZOOM = 12;

export interface SiBucket {
  max: number;
  hex: string;
  cssVar: string;
  labelId: string;
  labelEn: string;
}

export const SI_PALETTE: SiBucket[] = [
  { max: 0.2, hex: "#22c55e", cssVar: "--color-si-low", labelId: "Rendah", labelEn: "Low" },
  {
    max: 0.4,
    hex: "#84cc16",
    cssVar: "--color-si-moderate",
    labelId: "Sedang",
    labelEn: "Moderate",
  },
  {
    max: 0.6,
    hex: "#eab308",
    cssVar: "--color-si-elevated",
    labelId: "Waspada",
    labelEn: "Elevated",
  },
  { max: 0.8, hex: "#f97316", cssVar: "--color-si-high", labelId: "Tinggi", labelEn: "High" },
  {
    max: 1.0,
    hex: "#ef4444",
    cssVar: "--color-si-critical",
    labelId: "Kritis",
    labelEn: "Critical",
  },
];

// Fallback Severity Index when a flood point has no computed SI yet (e.g. the
// severity endpoint failed). Markers and the choropleth share it so a genangan
// is always rendered consistently instead of silently vanishing from one layer.
export const DEFAULT_SI = 0.5;

export function siColor(si: number | null | undefined): string {
  if (si == null || Number.isNaN(si)) return "#94a3b8";
  for (const bucket of SI_PALETTE) if (si <= bucket.max) return bucket.hex;
  return SI_PALETTE[SI_PALETTE.length - 1].hex;
}

export function siLabel(si: number | null | undefined): string {
  if (si == null || Number.isNaN(si)) return "—";
  for (const bucket of SI_PALETTE) if (si <= bucket.max) return bucket.labelId;
  return SI_PALETTE[SI_PALETTE.length - 1].labelId;
}

// Placeholder SI derived from depth until backend AHP+EW module lands (M1).
// Assumes 25 cm ~ moderate, 60 cm ~ high, 100 cm+ = critical.
export function depthToSiPlaceholder(depthCm: number | null | undefined): number {
  if (depthCm == null || Number.isNaN(depthCm)) return 0.5;
  const normalized = Math.min(depthCm / 100, 1);
  return Number(normalized.toFixed(2));
}

// Road class ordinal as classified from OSM highway tags (see roads.py).
export const ROAD_CLASS_LABELS: Record<number, string> = {
  5: "Arteri (trunk / primer)",
  4: "Sekunder",
  3: "Tersier",
  2: "Permukiman",
  1: "Layanan / lingkungan",
};

// One colour per vehicle, light enough to read as lines over the basemap. 24 hues
// picked by farthest-point sampling in CIELAB (L 58-78) so any two differ by
// dE >= 26, and vehicles of the same depot (neighbours in this list) by dE >= 27.
// The index is the vehicle's slot in the fleet, which is fixed by depot order and
// tank size, so a vehicle keeps its colour on every run. DESIGN.md allows only
// eight route hues; this is a deliberate exception, one colour per vehicle.
export const ROUTE_COLORS: string[] = [
  "#26d980",
  "#f600ff",
  "#6fd912",
  "#d755f1",
  "#d9be12",
  "#a171f4",
  "#a4cf59",
  "#ff29b8",
  "#35b68b",
  "#ff4d00",
  "#14a9ff",
  "#ff9914",
  "#528bff",
  "#ff7847",
  "#2fd5da",
  "#ff3d84",
  "#25a8d0",
  "#ff525d",
  "#c0a0e3",
  "#d6be71",
  "#ff8ff8",
  "#cd8251",
  "#f47bab",
  "#ff938f",
];

export const BASE_MAP_LAYERS = {
  standard: {
    id: "standard",
    label: "Standar",
    urlTemplate: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  positron: {
    id: "positron",
    // Esri light-gray canvas: keyless, neutral backdrop ideal for the
    // choropleth. Replaces CARTO Positron, which now serves an
    // "API KEY REQUIRED" watermark tile for anonymous use.
    label: "Terang",
    urlTemplate:
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors",
  },
  darkmatter: {
    id: "darkmatter",
    label: "Gelap",
    urlTemplate:
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors",
  },
  satellite: {
    id: "satellite",
    label: "Satelit",
    urlTemplate:
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution:
      "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
  },
} as const;

export type BaseMapId = keyof typeof BASE_MAP_LAYERS;

export type OverlayLayerId = "floods" | "depots" | "ifs" | "faskes" | "choropleth";

export interface OverlayLayerMeta {
  id: OverlayLayerId;
  label: string;
  swatchColor: string;
  defaultVisible: boolean;
}

export const OVERLAY_LAYERS: OverlayLayerMeta[] = [
  {
    id: "floods",
    label: "Titik Genangan",
    swatchColor: "#ef4444",
    defaultVisible: true,
  },
  {
    id: "depots",
    label: "Depo Pemadam",
    swatchColor: "#f59e0b",
    defaultVisible: true,
  },
  {
    id: "ifs",
    label: "Sungai (IF)",
    swatchColor: "#0284c7",
    defaultVisible: false,
  },
  {
    id: "faskes",
    label: "Fasilitas Kesehatan",
    swatchColor: "#059669",
    defaultVisible: false,
  },
  {
    id: "choropleth",
    label: "Indeks Keparahan per Kecamatan",
    swatchColor: "#f97316",
    defaultVisible: false,
  },
];

/** Marker accent per facility kind, shared by the map icons and the detail panels. */
export const FACILITY_COLORS = {
  depot: "var(--color-depot-accent)",
  if: "#0284c7",
  faskes: "#059669",
} as const;
