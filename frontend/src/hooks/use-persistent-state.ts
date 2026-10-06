"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import { writeJSON } from "../lib/storage";

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * State kept in localStorage. It reads as `fallback` on the server and during
 * hydration, then switches to the saved value, so the first render never differs
 * between server and client. `fallback` must be a stable reference.
 */
export function usePersistentState<T>(
  key: string,
  fallback: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null,
  );
  const value = useMemo(() => {
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }, [raw, fallback]);

  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved =
        typeof next === "function" ? (next as (prev: T) => T)(latest.current) : next;
      latest.current = resolved;
      writeJSON(key, resolved);
      listeners.forEach((l) => l());
    },
    [key],
  );

  return [value, set];
}

/** Drop a saved value and fall back to the default. */
export function clearPersistentState(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}
