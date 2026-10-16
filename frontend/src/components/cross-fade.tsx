"use client";

import { useEffect, useState, type ReactNode } from "react";

interface CrossFadeProps {
  /** Changing it swaps the content: the old fades out on top while the new slides in. */
  itemKey: string;
  children: ReactNode;
}

/** How long the outgoing content stays on screen, matching .detail-leave. */
const LEAVE_MS = 220;

/**
 * Cross-fades between contents keyed by `itemKey`. The outgoing one is laid over
 * the incoming one (taking no space), so a surrounding AnimatedHeight eases
 * straight from the old height to the new.
 */
export function CrossFade({ itemKey, children }: CrossFadeProps) {
  const [current, setCurrent] = useState<{ key: string; node: ReactNode }>({
    key: itemKey,
    node: children,
  });
  const [leaving, setLeaving] = useState<{ key: string; node: ReactNode }[]>([]);

  // A new key: the shown content steps out. Adjusting state while rendering is
  // React's pattern for state derived from a prop change.
  if (itemKey !== current.key) {
    setLeaving((l) => [...l.filter((x) => x.key !== itemKey), current].slice(-2));
    setCurrent({ key: itemKey, node: children });
  }

  useEffect(() => {
    if (leaving.length === 0) return;
    const t = window.setTimeout(() => setLeaving([]), LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [leaving]);

  return (
    <div className="relative">
      {leaving.map((l) => (
        <div key={l.key} aria-hidden inert className="detail-leave absolute inset-x-0 top-0">
          {l.node}
        </div>
      ))}
      <div key={itemKey} className="detail-enter">
        {children}
      </div>
    </div>
  );
}
