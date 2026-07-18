"use client";

import { Play, Settings2 } from "lucide-react";

import type { AlgorithmType } from "../lib/api";

interface MobileRunBarProps {
  algorithm: AlgorithmType;
  onAlgorithmChange: (a: AlgorithmType) => void;
  isLoading: boolean;
  onRun: () => void;
  onOpenSettings: () => void;
}

/** Always-visible run bar — optimization can be triggered directly from the
 *  map screen, without first opening a settings dock. */
export function MobileRunBar({
  algorithm,
  onAlgorithmChange,
  isLoading,
  onRun,
  onOpenSettings,
}: MobileRunBarProps) {
  return (
    <div className="pointer-events-auto flex items-center gap-8 rounded-lg border border-frost bg-pure-white p-8">
      <div className="flex flex-shrink-0 gap-[4px] rounded-lg bg-periwinkle-wash p-[4px]">
        <MiniTab
          active={algorithm === "acs"}
          label="ACS"
          onClick={() => onAlgorithmChange("acs")}
        />
        <MiniTab
          active={algorithm === "vns"}
          label="VNS"
          onClick={() => onAlgorithmChange("vns")}
        />
      </div>

      <button
        type="button"
        disabled={isLoading}
        onClick={onRun}
        className={`inline-flex min-w-0 flex-1 items-center justify-center gap-[6px] rounded-md border-0 px-12 py-[10px] text-[13px] font-bold tracking-[-0.13px] text-white transition-colors ${
          isLoading ? "cursor-wait bg-steel" : "cursor-pointer bg-indigo-ink"
        }`}
      >
        {isLoading ? (
          <>
            <Spinner />
            Menghitung...
          </>
        ) : (
          <>
            <Play size={14} strokeWidth={2.5} />
            Jalankan
          </>
        )}
      </button>

      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Pengaturan algoritma"
        title="Pengaturan lanjutan"
        className="flex h-[38px] w-[38px] flex-shrink-0 cursor-pointer items-center justify-center rounded-md border border-frost bg-pure-white text-steel transition-colors hover:border-smoke hover:bg-mist"
      >
        <Settings2 size={16} strokeWidth={2} />
      </button>
    </div>
  );
}

function MiniTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer whitespace-nowrap rounded-md border-0 px-[9px] py-[4px] text-[11px] font-bold transition-[background,color,box-shadow] duration-150 ${
        active
          ? "bg-active-wash text-active-ink shadow-[0_1px_2px_0_rgb(0_0_0/0.06)]"
          : "bg-transparent text-steel shadow-none"
      }`}
    >
      {label}
    </button>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-[12px] w-[12px] rounded-full border-2 border-white/35 border-t-white"
      style={{ animation: "response-spin 0.8s linear infinite" }}
    />
  );
}
