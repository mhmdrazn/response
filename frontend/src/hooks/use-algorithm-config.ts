"use client";

import { useEffect, useRef, useState } from "react";

import {
  DEFAULT_ACS_PARAMS,
  DEFAULT_VNS_PARAMS,
  type AlgorithmType,
  type RunRequest,
} from "../lib/api";
import type { ACSParams, VNSParams } from "../types";

export interface UseAlgorithmConfig {
  algorithm: AlgorithmType;
  setAlgorithm: (a: AlgorithmType) => void;
  acsParams: ACSParams;
  updateACS: <K extends keyof ACSParams>(key: K, value: ACSParams[K]) => void;
  vnsParams: VNSParams;
  updateVNS: <K extends keyof VNSParams>(key: K, value: VNSParams[K]) => void;
  buildRunRequest: () => RunRequest;
}

const STORAGE_KEY = "floodroute:algo-config:v1";

interface StoredConfig {
  algorithm: AlgorithmType;
  acsParams: ACSParams;
  vnsParams: VNSParams;
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
  const hydrated = useRef(false);

  useEffect(() => {
    const stored = loadStored();
    if (stored) {
      setAlgorithm(stored.algorithm);
      setAcsParams({ ...DEFAULT_ACS_PARAMS, ...stored.acsParams });
      setVnsParams({ ...DEFAULT_VNS_PARAMS, ...stored.vnsParams });
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    saveStored({ algorithm, acsParams, vnsParams });
  }, [algorithm, acsParams, vnsParams]);

  function updateACS<K extends keyof ACSParams>(key: K, value: ACSParams[K]) {
    setAcsParams((p) => ({ ...p, [key]: value }));
  }

  function updateVNS<K extends keyof VNSParams>(key: K, value: VNSParams[K]) {
    setVnsParams((p) => ({ ...p, [key]: value }));
  }

  function buildRunRequest(): RunRequest {
    return algorithm === "acs"
      ? { algorithm: "acs", params: acsParams }
      : { algorithm: "vns", params: vnsParams };
  }

  return {
    algorithm,
    setAlgorithm,
    acsParams,
    updateACS,
    vnsParams,
    updateVNS,
    buildRunRequest,
  };
}
