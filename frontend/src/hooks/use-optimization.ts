"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api, DEFAULT_ACS_PARAMS, DEFAULT_VNS_PARAMS, type RunRequest } from "../lib/api";
import type { ComparisonResult, OptimizationResult } from "../types";

export interface UseOptimization {
  result: OptimizationResult | null;
  comparison: ComparisonResult | null;
  isLoading: boolean;
  error: string | null;
  run: (req: RunRequest) => Promise<void>;
  runComparison: (seed?: number) => Promise<void>;
  reset: () => void;
  hydrated: boolean;
}

const STORAGE_KEY = "floodroute:optimization:v1";
const STORAGE_VERSION = 1;

interface StoredPayload {
  version: number;
  savedAt: number;
  result: OptimizationResult | null;
  comparison: ComparisonResult | null;
}

/** Persist result+comparison to localStorage so a refresh does not lose
 *  the current optimization. Uses window guards for SSR safety. */
function loadStored(): StoredPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPayload;
    if (parsed.version !== STORAGE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveStored(payload: StoredPayload): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota exceeded or storage unavailable — silently drop */
  }
}

function clearStored(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function useOptimization(): UseOptimization {
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const skipNextPersist = useRef(true);

  // Hydrate from localStorage on mount (client-side only)
  useEffect(() => {
    const stored = loadStored();
    if (stored) {
      setResult(stored.result);
      setComparison(stored.comparison);
    }
    setHydrated(true);
  }, []);

  // Persist whenever result/comparison changes, but skip the very first
  // effect run so we don't wipe a stored payload with initial nulls before
  // hydration finishes.
  useEffect(() => {
    if (!hydrated) return;
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    if (result === null && comparison === null) {
      clearStored();
      return;
    }
    saveStored({
      version: STORAGE_VERSION,
      savedAt: Date.now(),
      result,
      comparison,
    });
  }, [result, comparison, hydrated]);

  const run = useCallback(async (req: RunRequest) => {
    setIsLoading(true);
    setError(null);
    setComparison(null);
    try {
      const r =
        req.algorithm === "acs" ? await api.runACS(req.params) : await api.runVNS(req.params);
      setResult(r);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Optimasi gagal.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const runComparison = useCallback(async (seed?: number) => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    setComparison(null);
    try {
      const s = seed ?? 42;
      const acsResult = await api.runACS({ ...DEFAULT_ACS_PARAMS, seed: s });
      const vnsResult = await api.runVNS({ ...DEFAULT_VNS_PARAMS, seed: s });
      const comp: ComparisonResult = { acs: acsResult, vns: vnsResult };
      setComparison(comp);
      setResult(acsResult);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Perbandingan gagal.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setComparison(null);
    setError(null);
    clearStored();
  }, []);

  return {
    result,
    comparison,
    isLoading,
    error,
    run,
    runComparison,
    reset,
    hydrated,
  };
}
