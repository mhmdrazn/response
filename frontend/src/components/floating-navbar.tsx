"use client";

import { PanelLeftClose } from "lucide-react";

import { ModeToggle } from "./mode-toggle";
import type { AppMode } from "../types";

interface FloatingNavbarProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  compact?: boolean;
  onHidePanels?: () => void;
  /** Extra classes (e.g. hide/show transition state) appended to the root. */
  className?: string;
  /** Widest it may get, so it stops short of the results column on the right. */
  maxWidth?: number;
}

export function FloatingNavbar({
  mode,
  onModeChange,
  compact = false,
  onHidePanels,
  className = "",
  maxWidth,
}: FloatingNavbarProps) {
  return (
    <div
      style={maxWidth != null ? { maxWidth } : undefined}
      className={`border-frost bg-pure-white absolute z-[1000] flex items-center rounded-lg border ${
        compact
          ? "top-12 right-12 left-12 gap-8 px-[10px] py-[6px]"
          : "top-16 left-16 gap-12 px-[14px] py-8"
      } ${className || "pointer-events-auto"}`.trim()}
    >
      <div className="flex min-w-0 items-center gap-16">
        <span
          aria-hidden
          className={`navbar-status-dot bg-indigo-ink inline-block flex-shrink-0 rounded-full ${
            compact ? "h-8 w-8" : "h-[10px] w-[10px]"
          }`}
        />
        <span
          className={`text-midnight-ink flex-shrink-0 leading-none font-bold tracking-[-0.2px] ${
            compact ? "text-[15px]" : "text-[17px]"
          }`}
        >
          Response
        </span>
        {!compact ? (
          <span className="border-frost text-slate ml-8 min-w-0 truncate border-l pl-[10px] text-[12px] leading-none font-semibold">
            Sistem Pendukung Keputusan - Dinas Pemadam Kebakaran dan Penyelamatan Kota Surabaya
          </span>
        ) : null}
      </div>
      <div className="flex-1" />
      {onHidePanels ? (
        <button
          type="button"
          onClick={onHidePanels}
          title="Sembunyikan semua panel"
          aria-label="Sembunyikan semua panel"
          className="border-frost bg-pure-white text-steel hover:bg-mist inline-flex flex-shrink-0 cursor-pointer items-center gap-[6px] rounded-md border px-[10px] py-[6px] text-[12px] font-bold tracking-[-0.1px] transition-colors"
        >
          <PanelLeftClose size={14} strokeWidth={2} />
          Sembunyikan
        </button>
      ) : null}
      <div className="bg-frost h-24 w-px flex-shrink-0" />
      <ModeToggle mode={mode} onChange={onModeChange} compact={compact} />
    </div>
  );
}
