"use client";

import { useCallback } from "react";

import { DEFAULT_PRIORITY, priorityPayload, type PriorityState } from "../lib/priority";
import { usePersistentState } from "./use-persistent-state";

const STORAGE_KEY = "floodroute:priority:v1";

export interface UsePriority {
  priority: PriorityState;
  setPriority: (next: PriorityState) => void;
  reset: () => void;
  /** Weights to send with requests; null while the default mix is in use. */
  weights: number[] | null;
}

export function usePriority(): UsePriority {
  const [priority, setStored] = usePersistentState<PriorityState>(STORAGE_KEY, DEFAULT_PRIORITY);

  const setPriority = useCallback((next: PriorityState) => setStored(next), [setStored]);
  const reset = useCallback(() => setStored(DEFAULT_PRIORITY), [setStored]);

  return { priority, setPriority, reset, weights: priorityPayload(priority) };
}
