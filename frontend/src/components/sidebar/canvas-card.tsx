"use client";

import { Eraser, MousePointerClick, Upload } from "lucide-react";

interface CanvasCardProps {
  /** Flood points placed on the canvas so far. */
  count: number;
  onAddPoint: () => void;
  onImport: () => void;
  onReset: () => void;
  disabled?: boolean;
}

/**
 * Shown while the blank canvas is open: how to place flood points, and a way to
 * start over. The study areas are recorded events and have no such card.
 */
export function CanvasCard({ count, onAddPoint, onImport, onReset, disabled }: CanvasCardProps) {
  const empty = count === 0;
  return (
    <section
      aria-label="Kanvas baru"
      className="border-frost bg-mist flex flex-col gap-[8px] rounded-lg border px-[12px] py-[10px]"
    >
      <div className="flex items-baseline justify-between gap-8">
        <span className="text-midnight-ink text-[12.5px] font-bold">
          {empty ? "Kanvas masih kosong" : `${count} titik genangan di kanvas`}
        </span>
        {!empty ? (
          <button
            type="button"
            onClick={onReset}
            disabled={disabled}
            className="text-indigo-ink inline-flex flex-shrink-0 cursor-pointer items-center gap-[4px] border-0 bg-transparent p-0 text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Eraser size={12} strokeWidth={2.2} aria-hidden />
            Kosongkan
          </button>
        ) : null}
      </div>
      <p className="text-slate m-0 text-[11px] leading-[1.4] font-medium">
        {empty
          ? "Tentukan titik genangan sendiri: klik di peta atau unggah CSV, lalu jalankan optimasi untuk membuat rutenya."
          : "Tambah titik lagi atau jalankan optimasi. Area studi lain tidak berubah."}
      </p>
      <div className="flex gap-[6px]">
        <button
          type="button"
          onClick={onAddPoint}
          disabled={disabled}
          className="bg-indigo-ink hover:bg-indigo-hover inline-flex flex-1 cursor-pointer items-center justify-center gap-[5px] rounded-md border-0 px-[10px] py-[7px] text-[11.5px] font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          <MousePointerClick size={13} strokeWidth={2.2} aria-hidden />
          Klik di peta
        </button>
        <button
          type="button"
          onClick={onImport}
          disabled={disabled}
          className="border-frost bg-pure-white text-steel hover:bg-mist inline-flex flex-1 cursor-pointer items-center justify-center gap-[5px] rounded-md border px-[10px] py-[7px] text-[11.5px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload size={13} strokeWidth={2.2} aria-hidden />
          Unggah CSV
        </button>
      </div>
    </section>
  );
}
