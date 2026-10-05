"use client";

import { useEffect, useState } from "react";

/**
 * Keeps something mounted long enough to animate out.
 *
 * `shown` is the value to render: it follows `value` immediately while it is set
 * and lingers for `exitMs` after it clears. `visible` is the flag to animate on.
 * It turns off the moment `value` clears, so the exit transition starts at once,
 * and turns on a beat after first mounting, so the enter transition has a
 * starting state to move from.
 */
export function usePresence<T>(
  value: T | null,
  exitMs = 240,
): { shown: T | null; visible: boolean } {
  const [shown, setShown] = useState<T | null>(value);
  const [entered, setEntered] = useState(false);

  if (value !== null && shown !== value) setShown(value);

  useEffect(() => {
    if (value === null) return;
    // A timer rather than a frame callback: it must not depend on painting.
    const timer = setTimeout(() => setEntered(true), 30);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    if (value !== null) return;
    const timer = setTimeout(() => {
      setShown(null);
      setEntered(false);
    }, exitMs);
    return () => clearTimeout(timer);
  }, [value, exitMs]);

  return { shown, visible: value !== null && entered };
}
