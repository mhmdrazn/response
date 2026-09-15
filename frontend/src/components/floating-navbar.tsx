"use client";

import { LayoutDashboard, Maximize2 } from "lucide-react";

import { ModeToggle } from "./mode-toggle";
import type { AppLayout, AppMode } from "../types";

interface FloatingNavbarProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  compact?: boolean;
  layout?: AppLayout;
  onToggleLayout?: () => void;
}

export function FloatingNavbar({
  mode,
  onModeChange,
  compact = false,
  layout,
  onToggleLayout,
}: FloatingNavbarProps) {
  return (
    <div
      className={`pointer-events-auto absolute z-[1000] flex items-center rounded-lg border border-frost bg-pure-white ${
        compact
          ? "left-12 right-12 top-12 gap-8 px-[10px] py-[6px]"
          : "left-16 top-16 gap-12 px-[14px] py-8"
      }`}
    >
      <div className="flex min-w-0 items-center gap-16">
        <span
          aria-hidden
          className={`navbar-status-dot inline-block flex-shrink-0 rounded-full bg-indigo-ink ${
            compact ? "h-8 w-8" : "h-[10px] w-[10px]"
          }`}
        />
        <span
          className={`font-bold leading-none tracking-[-0.2px] text-midnight-ink ${
            compact ? "text-[15px]" : "text-[17px]"
          }`}
        >
          Response
        </span>
        {!compact ? (
          <span className="ml-8 border-l border-frost pl-[10px] text-[12px] font-semibold leading-none text-slate">
            SPK Damkar Surabaya
          </span>
        ) : null}
      </div>
      <div className="flex-1" />
      {!compact && onToggleLayout ? (
        <LayoutToggle layout={layout ?? "fullscreen"} onToggle={onToggleLayout} />
      ) : null}
      <div className="h-24 w-px flex-shrink-0 bg-frost" />
      <ModeToggle mode={mode} onChange={onModeChange} compact={compact} />
    </div>
  );
}

export function LayoutToggle({
  layout,
  onToggle,
}: {
  layout: AppLayout;
  onToggle: () => void;
}) {
  const toWindowed = layout === "fullscreen";
  return (
    <button
      type="button"
      onClick={onToggle}
      title={toWindowed ? "Tampilan berjendela (dashboard)" : "Tampilan peta penuh"}
      aria-label={toWindowed ? "Ganti ke tampilan berjendela" : "Ganti ke peta penuh"}
      className="inline-flex flex-shrink-0 cursor-pointer items-center gap-[6px] rounded-md border border-frost bg-pure-white px-[10px] py-[6px] text-[12px] font-bold tracking-[-0.1px] text-steel transition-colors hover:bg-mist"
    >
      {toWindowed ? <LayoutDashboard size={14} strokeWidth={2} /> : <Maximize2 size={14} strokeWidth={2} />}
      {toWindowed ? "Berjendela" : "Peta Penuh"}
    </button>
  );
}
