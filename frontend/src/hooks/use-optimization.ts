"use client";

import { useCallback, useState } from "react";

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
}

export function useOptimization(): UseOptimization {
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (req: RunRequest) => {
    setIsLoading(true);
    setError(null);
    setComparison(null);
    try {
      const r =
        req.algorithm === "acs"
          ? await api.runACS(req.params)
          : await api.runVNS(req.params);
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
  }, []);

  return { result, comparison, isLoading, error, run, runComparison, reset };
}
