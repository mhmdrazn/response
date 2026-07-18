// Aggregates per-flood-point Severity Index values into per-kecamatan
// (district) statistics for the choropleth layer. Pure geometry + arithmetic,
// runs client-side; no algorithm logic lives here.

import type { Feature, MultiPolygon, Polygon, Position } from "geojson";

import type { FloodPoint } from "../types";

export interface KecamatanProperties {
  kecamatan: string;
  code: string;
}

export type KecamatanFeature = Feature<Polygon | MultiPolygon, KecamatanProperties>;

export interface KecamatanStat {
  /** Number of flood points falling inside this kecamatan. */
  count: number;
  /** Mean Severity Index of those points (0 when count is 0). */
  meanSi: number;
  /** Highest Severity Index among those points (0 when count is 0). */
  maxSi: number;
  /** Total severity load: sum of SI over all points in the kecamatan. */
  totalLoad: number;
  /**
   * Total load normalized against the busiest kecamatan (load / maxLoad),
   * in [0, 1]. This is what drives the choropleth fill so that both the
   * NUMBER of flood points and their intensity move the color — consistent
   * with the objective function Z = Σ (SI · t), which sums severity.
   */
  loadNorm: number;
}

// Ray-casting test for a point against a single linear ring ([lon, lat] pairs).
function pointInRing(lon: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// A GeoJSON polygon is [outerRing, ...holes].
function pointInPolygon(lon: number, lat: number, polygon: Position[][]): boolean {
  if (polygon.length === 0 || !pointInRing(lon, lat, polygon[0])) return false;
  for (let h = 1; h < polygon.length; h++) {
    if (pointInRing(lon, lat, polygon[h])) return false; // inside a hole
  }
  return true;
}

export function pointInFeature(lon: number, lat: number, feature: KecamatanFeature): boolean {
  const geom = feature.geometry;
  if (geom.type === "Polygon") return pointInPolygon(lon, lat, geom.coordinates);
  return geom.coordinates.some((poly) => pointInPolygon(lon, lat, poly));
}

/**
 * Assigns each flood point to the kecamatan that contains it and returns a
 * map keyed by kecamatan `code` with the aggregated Severity Index stats.
 * The choropleth fill is driven by `loadNorm` (relative total severity load),
 * so a district with many moderate points can outrank one with a single
 * high-severity point.
 */
export function aggregateSiByKecamatan(
  floods: FloodPoint[],
  features: KecamatanFeature[],
): Map<string, KecamatanStat> {
  const sums = new Map<string, { total: number; count: number; max: number }>();

  for (const f of floods) {
    const si = f.si_value;
    if (si == null || Number.isNaN(si)) continue;
    // First containing polygon wins (kecamatan do not overlap).
    const hit = features.find((feat) => pointInFeature(f.lon, f.lat, feat));
    if (!hit) continue;
    const code = hit.properties.code;
    const acc = sums.get(code) ?? { total: 0, count: 0, max: 0 };
    acc.total += si;
    acc.count += 1;
    acc.max = Math.max(acc.max, si);
    sums.set(code, acc);
  }

  // Normalize the total load against the busiest kecamatan.
  let maxLoad = 0;
  for (const acc of sums.values()) maxLoad = Math.max(maxLoad, acc.total);

  const stats = new Map<string, KecamatanStat>();
  for (const feat of features) {
    const code = feat.properties.code;
    const acc = sums.get(code);
    stats.set(
      code,
      acc
        ? {
            count: acc.count,
            meanSi: acc.total / acc.count,
            maxSi: acc.max,
            totalLoad: acc.total,
            loadNorm: maxLoad > 0 ? acc.total / maxLoad : 0,
          }
        : { count: 0, meanSi: 0, maxSi: 0, totalLoad: 0, loadNorm: 0 },
    );
  }
  return stats;
}
