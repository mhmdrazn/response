"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Animates its own height whenever the content's height changes, so swapping one
 * panel for a taller or shorter one glides instead of jumping.
 *
 * The first measurement is applied without a transition (an `auto` to pixel change
 * cannot animate anyway); every later change eases between the two heights.
 */
export function AnimatedHeight({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      className="w-full overflow-hidden transition-[height] duration-[320ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
      style={{ height: height ?? "auto" }}
    >
      <div ref={inner}>{children}</div>
    </div>
  );
}
