"use client";

import { useSyncExternalStore } from "react";

export interface ViewportSize {
  w: number;
  h: number;
}

const SERVER: ViewportSize = { w: 1440, h: 900 };
let snapshot: ViewportSize = SERVER;

function read(): ViewportSize {
  if (typeof window === "undefined") return SERVER;
  const { innerWidth: w, innerHeight: h } = window;
  if (snapshot.w !== w || snapshot.h !== h) snapshot = { w, h };
  return snapshot;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

/** The window's inner size, kept current; the floating layout is laid out from it. */
export function useViewportSize(): ViewportSize {
  return useSyncExternalStore(subscribe, read, () => SERVER);
}
