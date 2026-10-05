"use client";

import type { CSSProperties, ReactNode } from "react";

import { usePresence } from "../hooks/use-presence";

interface RevealProps {
  open: boolean;
  /**
   * Gap (px) the parent flex column puts above this block. While the block is
   * shut it pulls itself up by that much, so the gap grows and shrinks with it
   * instead of popping in.
   */
  gap?: number;
  children: ReactNode;
}

/** Opens and closes a block by height and opacity, keeping it mounted while it animates out. */
export function Reveal({ open, gap = 0, children }: RevealProps) {
  const { shown, visible } = usePresence<ReactNode>(open ? children : null, 340);

  return (
    <div
      className="soft-row"
      data-open={visible}
      style={{ "--reveal-gap": `${gap}px` } as CSSProperties}
    >
      <div>{shown}</div>
    </div>
  );
}
