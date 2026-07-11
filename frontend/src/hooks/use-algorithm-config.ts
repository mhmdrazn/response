"use client";

import { useState } from "react";

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

export function useAlgorithmConfig(): UseAlgorithmConfig {
  const [algorithm, setAlgorithm] = useState<AlgorithmType>("acs");
  const [acsParams, setAcsParams] = useState<ACSParams>(DEFAULT_ACS_PARAMS);
  const [vnsParams, setVnsParams] = useState<VNSParams>(DEFAULT_VNS_PARAMS);

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
