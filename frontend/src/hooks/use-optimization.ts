"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api, DEFAULT_ACS_PARAMS, DEFAULT_VNS_PARAMS, type RunRequest } from "../lib/api";
import { carryOverVolumes, normalizeResult } from "../lib/periods";
import { readJSON, removeKey, writeJSON } from "../lib/storage";
import type { ComparisonResult, OptimizationResult, RunExtras } from "../types";

export type RunKind = "single" | "compare";
export type OptimizationStage = "acs" | "vns" | null;

/** Periods a plan may be rolled forward, to keep a runaway loop and the wait bounded. */
export const MAX_PERIODS = 6;

export interface UseOptimization {
  /** The period currently shown; periods[activePeriod]. */
  result: OptimizationResult | null;
  /** Every period of the plan so far, first run first. */
  periods: OptimizationResult[];
  activePeriod: number;
  setActivePeriod: (index: number) => void;
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
  /** Plan the next period from what the last one left undone. */
  runNextPeriod: (req: RunRequest, scenario?: string) => Promise<void>;
  /** Keep rolling forward until everything is pumped or the period limit is reached. */
  runRemainingPeriods: (req: RunRequest, scenario?: string) => Promise<void>;
  runComparison: (
    seed?: number,
    scenario?: string,
    timeLimitS?: number,
    extras?: RunExtras,
  ) => Promise<void>;
  reset: () => void;
  hydrated: boolean;
}

const STORAGE_KEY = "floodroute:optimization:v1";
const STORAGE_VERSION = 1;

interface StoredPayload {
  version: number;
  savedAt: number;
  /** The first period; kept on its own so older saves still load. */
  result: OptimizationResult | null;
  /** All periods, only written once there is more than one. */
  periods?: OptimizationResult[];
  activePeriod?: number;
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
  const [periods, setPeriods] = useState<OptimizationResult[]>([]);
  const [activePeriod, setActivePeriod] = useState(0);
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
  // The loop in runRemainingPeriods must see periods it has just added.
  const periodsRef = useRef<OptimizationResult[]>([]);
  useEffect(() => {
    periodsRef.current = periods;
  }, [periods]);

  const result = periods[activePeriod] ?? null;

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
      const all = (stored.periods ?? (stored.result ? [stored.result] : [])).map(normalizeResult);
      setPeriods(all);
      setActivePeriod(Math.min(stored.activePeriod ?? 0, Math.max(all.length - 1, 0)));
      setComparison(
        stored.comparison
          ? {
              acs: normalizeResult(stored.comparison.acs),
              vns: normalizeResult(stored.comparison.vns),
            }
          : null,
      );
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
    if (periods.length === 0 && comparison === null) {
      clearStored();
      return;
    }
    saveStored({
      version: STORAGE_VERSION,
      savedAt: Date.now(),
      result: periods[0] ?? null,
      periods: periods.length > 1 ? periods : undefined,
      activePeriod,
      comparison,
      completedAt,
      lastRunKind,
    });
  }, [periods, activePeriod, comparison, completedAt, lastRunKind, hydrated]);

  const solve = useCallback((req: RunRequest, scenario?: string) => {
    return req.algorithm === "acs"
      ? api.runACS(req.params, scenario)
      : api.runVNS(req.params, scenario);
  }, []);

  const beginRun = useCallback((req: RunRequest) => {
    setIsLoading(true);
    startedAt.current = Date.now();
    targetDuration.current = req.params.time_limit_s ?? 60;
    setElapsedSeconds(0);
    setProgress(0);
    setStage(req.algorithm);
    setError(null);
  }, []);

  const endRun = useCallback(() => {
    setIsLoading(false);
    startedAt.current = null;
    setStage(null);
  }, []);

  const run = useCallback(
    async (req: RunRequest, scenario?: string) => {
      beginRun(req);
      setComparison(null);
      try {
        const r = await solve(req, scenario);
        setPeriods([r]);
        setActivePeriod(0);
        setProgress(100);
        setLastRunKind("single");
        setCompletedAt(Date.now());
        setRunSignal((s) => s + 1);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Optimasi gagal.");
      } finally {
        endRun();
      }
    },
    [beginRun, endRun, solve],
  );

  /** One more period on top of `base`; resolves with the new list, or null if it failed. */
  const rollForward = useCallback(
    async (
      base: OptimizationResult[],
      req: RunRequest,
      scenario?: string,
    ): Promise<OptimizationResult[] | null> => {
      const last = base[base.length - 1];
      const carry = last ? carryOverVolumes(last) : null;
      if (!carry) return null;
      beginRun(req);
      try {
        const next = await solve(
          { ...req, params: { ...req.params, remaining_volumes: carry } } as RunRequest,
          scenario,
        );
        const all = [...base, next];
        setPeriods(all);
        setActivePeriod(all.length - 1);
        setProgress(100);
        setCompletedAt(Date.now());
        return all;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Periode berikutnya gagal.");
        return null;
      } finally {
        endRun();
      }
    },
    [beginRun, endRun, solve],
  );

  const runNextPeriod = useCallback(
    async (req: RunRequest, scenario?: string) => {
      if (periodsRef.current.length >= MAX_PERIODS) return;
      const all = await rollForward(periodsRef.current, req, scenario);
      if (all) setRunSignal((s) => s + 1);
    },
    [rollForward],
  );

  const runRemainingPeriods = useCallback(
    async (req: RunRequest, scenario?: string) => {
      let current = periodsRef.current;
      let added = 0;
      while (current.length < MAX_PERIODS && carryOverVolumes(current[current.length - 1])) {
        const all = await rollForward(current, req, scenario);
        if (!all) break;
        current = all;
        added += 1;
      }
      if (added > 0) setRunSignal((s) => s + 1);
    },
    [rollForward],
  );

  const runComparison = useCallback(
    async (seed?: number, scenario?: string, timeLimitS?: number, extras?: RunExtras) => {
      setIsLoading(true);
      startedAt.current = Date.now();
      const limit = timeLimitS ?? DEFAULT_ACS_PARAMS.time_limit_s ?? 60;
      targetDuration.current = limit * 2;
      setElapsedSeconds(0);
      setProgress(0);
      setStage("acs");
      setError(null);
      setPeriods([]);
      setActivePeriod(0);
      setComparison(null);
      try {
        const s = seed ?? 42;
        const acsResult = await api.runACS(
          { ...DEFAULT_ACS_PARAMS, ...extras, seed: s, time_limit_s: limit },
          scenario,
        );
        setStage("vns");
        const vnsResult = await api.runVNS(
          { ...DEFAULT_VNS_PARAMS, ...extras, seed: s, time_limit_s: limit },
          scenario,
        );
        const comp: ComparisonResult = { acs: acsResult, vns: vnsResult };
        setComparison(comp);
        setPeriods([acsResult]);
        setLastRunKind("compare");
        setCompletedAt(Date.now());
        setRunSignal((n) => n + 1);
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
    setPeriods([]);
    setActivePeriod(0);
    setComparison(null);
    setError(null);
    setCompletedAt(null);
    setLastRunKind(null);
    clearStored();
  }, []);

  return {
    result,
    periods,
    activePeriod,
    setActivePeriod,
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
    runNextPeriod,
    runRemainingPeriods,
    runComparison,
    reset,
    hydrated,
  };
}
