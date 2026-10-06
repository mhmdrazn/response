"use client";

import { useEffect, useRef, useState } from "react";

import {
  DEFAULT_ACS_PARAMS,
  DEFAULT_VNS_PARAMS,
  type AlgorithmType,
  type RunRequest,
} from "../lib/api";
import {
  COMPUTATION_BUDGETS,
  type ComputationBudget,
} from "../components/sidebar/computation-budget";
import type { ACSParams, RunExtras, VNSParams } from "../types";

const DEFAULT_BUDGET_S: ComputationBudget = 45;

export interface UseAlgorithmConfig {
  algorithm: AlgorithmType;
  setAlgorithm: (a: AlgorithmType) => void;
  acsParams: ACSParams;
  updateACS: <K extends keyof ACSParams>(key: K, value: ACSParams[K]) => void;
  vnsParams: VNSParams;
  updateVNS: <K extends keyof VNSParams>(key: K, value: VNSParams[K]) => void;
  budgetS: ComputationBudget;
  setBudgetS: (value: ComputationBudget) => void;
  buildRunRequest: (extras?: RunExtras) => RunRequest;
}

const STORAGE_KEY = "floodroute:algo-config:v4";

interface StoredConfig {
  algorithm: AlgorithmType;
  acsParams: ACSParams;
  vnsParams: VNSParams;
  budgetS?: number;
}

function loadStored(): StoredConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredConfig;
  } catch {
    return null;
  }
}

function saveStored(cfg: StoredConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

export function useAlgorithmConfig(): UseAlgorithmConfig {
  const [algorithm, setAlgorithm] = useState<AlgorithmType>("acs");
  const [acsParams, setAcsParams] = useState<ACSParams>(DEFAULT_ACS_PARAMS);
  const [vnsParams, setVnsParams] = useState<VNSParams>(DEFAULT_VNS_PARAMS);
  const [budgetS, setBudgetS] = useState<ComputationBudget>(DEFAULT_BUDGET_S);
  const hydrated = useRef(false);

  useEffect(() => {
    const stored = loadStored();
    if (stored) {
      setAlgorithm(stored.algorithm);
      setAcsParams({ ...DEFAULT_ACS_PARAMS, ...stored.acsParams });
      setVnsParams({ ...DEFAULT_VNS_PARAMS, ...stored.vnsParams });
      const b = COMPUTATION_BUDGETS.find((v) => v === stored.budgetS);
      if (b) setBudgetS(b);
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    saveStored({ algorithm, acsParams, vnsParams, budgetS });
  }, [algorithm, acsParams, vnsParams, budgetS]);

  function updateACS<K extends keyof ACSParams>(key: K, value: ACSParams[K]) {
    setAcsParams((p) => ({ ...p, [key]: value }));
  }

  function updateVNS<K extends keyof VNSParams>(key: K, value: VNSParams[K]) {
    setVnsParams((p) => ({ ...p, [key]: value }));
  }

  function buildRunRequest(extras?: RunExtras): RunRequest {
    return algorithm === "acs"
      ? { algorithm: "acs", params: { ...acsParams, ...extras, time_limit_s: budgetS } }
      : { algorithm: "vns", params: { ...vnsParams, ...extras, time_limit_s: budgetS } };
  }

  return {
    algorithm,
    setAlgorithm,
    acsParams,
    updateACS,
    vnsParams,
    updateVNS,
    budgetS,
    setBudgetS,
    buildRunRequest,
  };
}
