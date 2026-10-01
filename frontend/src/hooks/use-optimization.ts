"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api, DEFAULT_ACS_PARAMS, DEFAULT_VNS_PARAMS, type RunRequest } from "../lib/api";
import { readJSON, removeKey, writeJSON } from "../lib/storage";
import type { ComparisonResult, OptimizationResult } from "../types";

export type RunKind = "single" | "compare";
export type OptimizationStage = "acs" | "vns" | null;

export interface UseOptimization {
  result: OptimizationResult | null;
  comparison: ComparisonResult | null;
  isLoading: boolean;
  elapsedSeconds: number;
  progress: number;
  stage: OptimizationStage;
  error: string | null;
  /** Epoch ms of the last successful run; null before any run. */
  completedAt: number | null;
  lastRunKind: RunKind | null;
  /** Increments only on a run finished in THIS session (not on restore from
   *  storage) — drives the completion toast without firing on reload. */
  runSignal: number;
  run: (req: RunRequest, scenario?: string) => Promise<void>;
  runComparison: (seed?: number, scenario?: string, timeLimitS?: number) => Promise<void>;
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
  completedAt?: number | null;
  lastRunKind?: RunKind | null;
}

function loadStored(): StoredPayload | null {
  const parsed = readJSON<StoredPayload | null>(STORAGE_KEY, null);
  if (!parsed || parsed.version !== STORAGE_VERSION) return null;
  return parsed;
}

function saveStored(payload: StoredPayload): void {
  writeJSON(STORAGE_KEY, payload);
}

function clearStored(): void {
  removeKey(STORAGE_KEY);
}

export function useOptimization(): UseOptimization {
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<OptimizationStage>(null);
  const [error, setError] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<number | null>(null);
  const [lastRunKind, setLastRunKind] = useState<RunKind | null>(null);
  const [runSignal, setRunSignal] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const skipNextPersist = useRef(true);
  const startedAt = useRef<number | null>(null);
  const targetDuration = useRef(60);

  useEffect(() => {
    if (!isLoading) return;
    const updateElapsed = () => {
      if (startedAt.current !== null) {
        const elapsed = (Date.now() - startedAt.current) / 1000;
        setElapsedSeconds(elapsed);
        setProgress(Math.min(95, (elapsed / targetDuration.current) * 100));
      }
    };
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 100);
    return () => window.clearInterval(timer);
  }, [isLoading]);

  useEffect(() => {
    const stored = loadStored();
    if (stored) {
      setResult(stored.result);
      setComparison(stored.comparison);
      setCompletedAt(stored.completedAt ?? null);
      setLastRunKind(stored.lastRunKind ?? null);
    }
    setHydrated(true);
  }, []);

  // Skip first effect run to avoid overwriting stored payload before hydration
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
      completedAt,
      lastRunKind,
    });
  }, [result, comparison, completedAt, lastRunKind, hydrated]);

  const run = useCallback(async (req: RunRequest, scenario?: string) => {
    setIsLoading(true);
    startedAt.current = Date.now();
    targetDuration.current = req.params.time_limit_s ?? 60;
    setElapsedSeconds(0);
    setProgress(0);
    setStage(req.algorithm);
    setError(null);
    setComparison(null);
    try {
      const r =
        req.algorithm === "acs"
          ? await api.runACS(req.params, scenario)
          : await api.runVNS(req.params, scenario);
      setResult(r);
      setProgress(100);
      setLastRunKind("single");
      setCompletedAt(Date.now());
      setRunSignal((s) => s + 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Optimasi gagal.");
    } finally {
      setIsLoading(false);
      startedAt.current = null;
      setStage(null);
    }
  }, []);

  const runComparison = useCallback(
    async (seed?: number, scenario?: string, timeLimitS?: number) => {
    setIsLoading(true);
    startedAt.current = Date.now();
    const limit = timeLimitS ?? DEFAULT_ACS_PARAMS.time_limit_s ?? 60;
    targetDuration.current = limit * 2;
    setElapsedSeconds(0);
    setProgress(0);
    setStage("acs");
    setError(null);
    setResult(null);
    setComparison(null);
    try {
      const s = seed ?? 42;
      const acsResult = await api.runACS(
        { ...DEFAULT_ACS_PARAMS, seed: s, time_limit_s: limit },
        scenario,
      );
      setStage("vns");
      const vnsResult = await api.runVNS(
        { ...DEFAULT_VNS_PARAMS, seed: s, time_limit_s: limit },
        scenario,
      );
      const comp: ComparisonResult = { acs: acsResult, vns: vnsResult };
      setComparison(comp);
      setResult(acsResult);
      setLastRunKind("compare");
      setCompletedAt(Date.now());
      setRunSignal((s) => s + 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Perbandingan gagal.");
    } finally {
      setIsLoading(false);
      startedAt.current = null;
      setStage(null);
    }
  },
  [],
  );

  const reset = useCallback(() => {
    setResult(null);
    setComparison(null);
    setError(null);
    setCompletedAt(null);
    setLastRunKind(null);
    clearStored();
  }, []);

  return {
    result,
    comparison,
    isLoading,
    elapsedSeconds,
    progress,
    stage,
    error,
    completedAt,
    lastRunKind,
    runSignal,
    run,
    runComparison,
    reset,
    hydrated,
  };
}
