"use client";

import { useEffect, useState, type RefObject } from "react";

/** The element's current height in px (0 while it is not mounted), kept live. */
export function useElementHeight(ref: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  });
  return height;
}
