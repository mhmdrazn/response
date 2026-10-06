"use client";

import { Crosshair, X } from "lucide-react";
import { useEffect } from "react";

interface PickBannerProps {
  onCancel: () => void;
  /** Sits lower when the page has a floating navbar across the top. */
  belowNavbar?: boolean;
}

/** Tells the person the next map click places a point, and lets them back out. */
export function PickBanner({ onCancel, belowNavbar = false }: PickBannerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="status"
      className={`soft-enter pointer-events-auto absolute left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-[10px] rounded-lg border border-frost bg-pure-white py-[6px] pl-[12px] pr-[6px] ${
        belowNavbar ? "top-[84px]" : "top-16"
      }`}
    >
      <Crosshair size={15} strokeWidth={2.2} color="var(--color-indigo-ink)" aria-hidden />
      <span className="text-[12.5px] font-bold tracking-[-0.1px] text-midnight-ink">
        Klik peta untuk menaruh titik genangan
      </span>
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex cursor-pointer items-center gap-[4px] rounded-md border border-frost bg-pure-white px-[9px] py-[5px] text-[11.5px] font-bold text-steel transition-colors hover:bg-mist"
      >
        <X size={12} strokeWidth={2.4} />
        Batal
      </button>
    </div>
  );
}
