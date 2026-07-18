"use client";

import { useEffect, useState } from "react";

import { api } from "../lib/api";
import type {
  Depot,
  Faskes,
  FloodPoint,
  IntermediateFacility,
  SeverityIndexResponse,
} from "../types";

export interface MapData {
  floods: FloodPoint[];
  depots: Depot[];
  ifs: IntermediateFacility[];
  faskes: Faskes[];
  severity: SeverityIndexResponse | null;
}

export interface UseMapDataResult {
  data: MapData | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useMapData(): UseMapDataResult {
  const [data, setData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      api.getFloodPoints(),
      api.getDepots(),
      api.getIntermediateFacilities(),
      api.getFaskes(),
      api.getSeverityIndex().catch(() => null),
    ])
      .then(([floods, depots, ifs, faskes, severity]) => {
        if (cancelled) return;

        if (severity) {
          const siMap = new Map(severity.flood_points.map((fp) => [fp.id, fp.si_value]));
          for (const f of floods) {
            const si = siMap.get(f.id);
            if (si !== undefined) f.si_value = si;
          }
        }

        setData({ floods, depots, ifs, faskes, severity });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Gagal memuat data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return {
    data,
    loading,
    error,
    reload: () => setReloadKey((k) => k + 1),
  };
}
