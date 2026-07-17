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
  { max: 0.2, hex: "#22c55e", cssVar: "--color-si-low",      labelId: "Rendah",  labelEn: "Low" },
  { max: 0.4, hex: "#84cc16", cssVar: "--color-si-moderate", labelId: "Sedang",  labelEn: "Moderate" },
  { max: 0.6, hex: "#eab308", cssVar: "--color-si-elevated", labelId: "Waspada", labelEn: "Elevated" },
  { max: 0.8, hex: "#f97316", cssVar: "--color-si-high",     labelId: "Tinggi",  labelEn: "High" },
  { max: 1.0, hex: "#ef4444", cssVar: "--color-si-critical", labelId: "Kritis",  labelEn: "Critical" },
];

export function siColor(si: number | null | undefined): string {
  if (si == null || Number.isNaN(si)) return "#94a3b8";
  for (const bucket of SI_PALETTE) if (si <= bucket.max) return bucket.hex;
  return SI_PALETTE[SI_PALETTE.length - 1].hex;
}

// Placeholder SI derived from depth until backend AHP+EW module lands (M1).
// Assumes 25 cm ~ moderate, 60 cm ~ high, 100 cm+ = critical.
export function depthToSiPlaceholder(depthCm: number | null | undefined): number {
  if (depthCm == null || Number.isNaN(depthCm)) return 0.5;
  const normalized = Math.min(depthCm / 100, 1);
  return Number(normalized.toFixed(2));
}

export const ROUTE_COLORS: string[] = [
  "#dc2626",
  "#e11d48",
  "#0891b2",
  "#c026d3",
  "#ea580c",
  "#059669",
  "#7c3aed",
  "#0284c7",
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
    label: "Terang",
    urlTemplate:
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  darkmatter: {
    id: "darkmatter",
    label: "Gelap",
    urlTemplate:
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
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

export type OverlayLayerId = "floods" | "depots" | "ifs" | "faskes";

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
    defaultVisible: false,
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
];
