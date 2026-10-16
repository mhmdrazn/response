"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Swaps one item for another in two steps: the shown one fades out where it is
 * (still the same mounted component, nothing re-created), and only then is the
 * new one put in place to fade in. Opening (from nothing) and closing (to
 * nothing) pass straight through; usePresence animates those.
 *
 * `shown` is the item to render, `leaving` is true while it fades out.
 */
export function useFadeThrough<T>(
  value: T | null,
  keyOf: (v: T) => string,
  outMs = 160,
): { shown: T | null; leaving: boolean } {
  const [shown, setShown] = useState<T | null>(value);
  const [leaving, setLeaving] = useState(false);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  });

  const valueKey = value === null ? null : keyOf(value);
  const shownKey = shown === null ? null : keyOf(shown);
  // State derived from a prop change, adjusted while rendering (React's pattern).
  if (valueKey === shownKey) {
    if (value !== shown) setShown(value); // same item, fresher data
    if (leaving) setLeaving(false); // switched back before the swap
  } else if (value === null || shown === null) {
    setShown(value);
  } else if (!leaving) {
    setLeaving(true);
  }

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => {
      setShown(latest.current);
      setLeaving(false);
    }, outMs);
    return () => window.clearTimeout(t);
  }, [leaving, outMs]);

  return { shown, leaving };
}
