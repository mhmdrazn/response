"use client";

import type { ReactNode } from "react";

interface DockBodyProps {
  open: boolean;
  /** Inside an overlay sheet (mobile): no header, no collapsing, just the content. */
  bare?: boolean;
  /** Layout classes for the content itself. */
  className?: string;
  children: ReactNode;
}

/**
 * The collapsible body of a dock. It opens and closes by its real height (a grid
 * row going 1fr <-> 0fr) on the same 320 ms curve as the algorithm panel, so the
 * left column moves as one. The content stays laid out while closed, so its
 * natural height can be measured before it opens (`data-dock-content`).
 */
export function DockBody({ open, bare = false, className = "", children }: DockBodyProps) {
  if (bare) return <div className={className}>{children}</div>;
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-[320ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
        open ? "grid-rows-[1fr] opacity-100" : "pointer-events-none grid-rows-[0fr] opacity-0"
      }`}
    >
      <div className="min-h-0 overflow-hidden">
        <div data-dock-content className={`border-frost border-t px-12 pt-[10px] pb-12 ${className}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
