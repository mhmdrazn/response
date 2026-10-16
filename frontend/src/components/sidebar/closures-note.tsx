"use client";

import { Ban } from "lucide-react";

interface ClosuresNoteProps {
  depots: number;
  ifs: number;
  onClear: () => void;
  disabled?: boolean;
}

/** What the next run leaves out, set from the depot and outlet tooltips on the map. */
export function ClosuresNote({ depots, ifs, onClear, disabled }: ClosuresNoteProps) {
  if (depots === 0 && ifs === 0) return null;
  const parts = [
    depots > 0 ? `${depots} depo nonaktif` : null,
    ifs > 0 ? `${ifs} titik buang ditutup` : null,
  ].filter(Boolean);
  return (
    <section
      aria-label="Fasilitas tidak dipakai"
      className="border-frost bg-mist flex items-start gap-[10px] rounded-lg border px-[12px] py-[9px]"
    >
      <Ban
        size={14}
        strokeWidth={2.2}
        color="var(--color-indigo-ink)"
        className="mt-[2px] flex-shrink-0"
        aria-hidden
      />
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="text-midnight-ink text-[12.5px] font-bold">{parts.join(" · ")}</span>
        <span className="text-slate text-[11px] leading-[1.35] font-medium">
          Tidak dipakai pada optimasi berikutnya. Ubah lewat tooltip di peta.
        </span>
      </span>
      <button
        type="button"
        onClick={onClear}
        disabled={disabled}
        className="text-indigo-ink flex-shrink-0 cursor-pointer border-0 bg-transparent p-0 text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
      >
        Pulihkan semua
      </button>
    </section>
  );
}
