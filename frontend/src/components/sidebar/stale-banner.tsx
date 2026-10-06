"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";

import { GROUP_LABEL, type SettingGroup } from "../../lib/run-signature";

interface StaleBannerProps {
  groups: SettingGroup[];
  onRerun: () => void;
  isLoading: boolean;
  /** One line, for the phone's bottom bar. */
  compact?: boolean;
}

/** Warns that the plan on screen predates a change to the settings it depends on. */
export function StaleBanner({ groups, onRerun, isLoading, compact = false }: StaleBannerProps) {
  if (groups.length === 0) return null;
  const names = groups.map((g) => GROUP_LABEL[g]).join(", ");

  const button = (
    <button
      type="button"
      onClick={onRerun}
      disabled={isLoading}
      className={`font-manrope inline-flex items-center justify-center gap-[6px] rounded-md border-0 bg-[#b45309] px-[12px] py-[7px] text-[12px] font-bold tracking-[-0.1px] text-white transition-colors hover:bg-[#92400e] ${
        compact ? "flex-shrink-0" : "w-full"
      } ${isLoading ? "cursor-wait opacity-60" : "cursor-pointer"}`}
    >
      <RefreshCw size={13} strokeWidth={2.4} className={isLoading ? "animate-spin" : ""} />
      Jalankan ulang
    </button>
  );

  if (compact) {
    return (
      <div
        role="alert"
        className="soft-enter pointer-events-auto flex items-center gap-[8px] rounded-lg border border-[#fde68a] bg-[#fffbeb] py-[6px] pl-[12px] pr-[6px]"
      >
        <TriangleAlert size={15} strokeWidth={2.2} color="#b45309" className="flex-shrink-0" />
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#92400e]">
          {names} berubah
        </span>
        {button}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="soft-enter pointer-events-auto flex flex-col gap-[10px] rounded-lg border border-[#fde68a] bg-[#fffbeb] p-[12px]"
    >
      <div className="flex items-start gap-[10px]">
        <TriangleAlert size={16} strokeWidth={2.2} color="#b45309" className="mt-px flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-[12.5px] font-bold leading-[1.3] text-[#92400e]">
            Hasil ini belum memakai pengaturan terbaru
          </div>
          <p className="m-0 mt-[3px] text-[11.5px] font-medium leading-[1.45] text-[#92400e]">
            Berubah sejak optimasi terakhir: <b>{names}</b>. Jalankan ulang agar rute, cakupan, dan
            periode sesuai. Perencanaan periode kembali dimulai dari periode 1.
          </p>
        </div>
      </div>
      {button}
    </div>
  );
}
