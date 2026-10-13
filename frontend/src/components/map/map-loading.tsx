"use client";

import { AlertTriangle } from "lucide-react";

interface MapLoadingProps {
  /** Headline above the loading bar. */
  title?: string;
  /** Set when loading failed; replaces the loading bar with the reason. */
  error?: string | null;
}

/**
 * The one loading screen of the map area: a title and a sliding loading bar.
 * Shown while the data loads and while the map itself starts.
 */
export function MapLoading({ title = "Memuat peta", error = null }: MapLoadingProps) {
  if (error) {
    return (
      <div className="bg-mist flex h-full w-full items-center justify-center">
        <div className="soft-pop flex max-w-[360px] flex-col items-center gap-[10px] px-24 text-center">
          <span className="bg-pure-white border-frost text-indigo-ink flex h-[44px] w-[44px] items-center justify-center rounded-full border">
            <AlertTriangle size={20} strokeWidth={2} />
          </span>
          <p className="text-midnight-ink m-0 text-[17px] font-bold tracking-[-0.2px]">
            Gagal memuat data
          </p>
          <p className="text-steel m-0 text-[13px] leading-[1.5] font-medium">{error}</p>
          <p className="text-slate m-0 text-[12px] leading-[1.5] font-medium">
            Pastikan backend berjalan di <code>http://localhost:8000</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-mist flex h-full w-full items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <div className="soft-pop flex w-[240px] flex-col items-center gap-[12px]">
        <p className="text-midnight-ink m-0 text-[15px] font-bold tracking-[-0.15px]">{title}</p>
        <div className="bg-frost relative h-[4px] w-full overflow-hidden rounded-full">
          <span className="map-loading-bar bg-indigo-ink absolute inset-y-0 left-0 rounded-full" />
        </div>
        <p className="text-slate m-0 text-center text-[12px] font-medium">
          Menyiapkan titik genangan, depo, dan peta Surabaya
        </p>
      </div>
    </div>
  );
}
