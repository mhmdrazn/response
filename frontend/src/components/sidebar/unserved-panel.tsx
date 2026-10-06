"use client";

import { CheckCircle2, Lightbulb } from "lucide-react";

import { formatNumber } from "../../lib/format-metrics";
import { DEFAULT_SI, siColor } from "../../lib/map-constants";
import { describeSuggestion, REASON_LABEL } from "../../lib/unserved";
import type { OptimizationResult, Suggestion, UnservedReason } from "../../types";
import { useToast } from "../toast";

interface UnservedPanelProps {
  result: OptimizationResult;
  onSelectFlood: (id: string) => void;
  /** Change the fleet as the suggestion says; resolves with a one-line description. */
  onApplySuggestion: (s: Suggestion) => string;
}

const REASON_TONE: Record<UnservedReason, string> = {
  no_unit: "bg-[#fef2f2] text-[#b91c1c]",
  out_of_range: "bg-[#fef2f2] text-[#b91c1c]",
  far: "bg-[#fffbeb] text-[#b45309]",
  capacity: "bg-[#fffbeb] text-[#b45309]",
  priority: "bg-periwinkle-wash text-steel",
  unscheduled: "bg-periwinkle-wash text-steel",
};

export function UnservedPanel({ result, onSelectFlood, onApplySuggestion }: UnservedPanelProps) {
  const toast = useToast();
  const open = result.unserved;

  if (open.length === 0 && result.unserved_points > 0) {
    return (
      <p className="m-0 rounded-md border border-frost bg-mist px-[12px] py-[12px] text-[12px] font-semibold leading-[1.45] text-steel">
        Hasil ini disimpan sebelum rincian titik belum tuntas tersedia. Jalankan optimasi lagi untuk
        melihat alasan dan sarannya.
      </p>
    );
  }

  if (open.length === 0) {
    return (
      <div className="flex items-center gap-[8px] rounded-md border border-frost bg-mist px-[12px] py-[12px] text-[12.5px] font-semibold text-steel">
        <CheckCircle2 size={16} strokeWidth={2.2} color="var(--color-si-low)" />
        Semua titik genangan tuntas pada rencana ini.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[14px]">
      <p className="m-0 text-[12px] font-medium leading-[1.45] text-steel">
        {open.length} titik belum tuntas, sisa {formatNumber(result.unserved_volume_l)} L (
        {formatNumber(100 - result.coverage_pct, 1)}% dari beban periode ini). Urutan: yang paling
        merugikan lebih dulu.
      </p>

      {result.suggestions.length > 0 ? (
        <section className="flex flex-col gap-[8px]">
          <h3 className="m-0 flex items-center gap-[6px] text-[10px] font-bold uppercase tracking-[0.9px] text-slate">
            <Lightbulb size={12} strokeWidth={2.2} aria-hidden />
            Saran
          </h3>
          {result.suggestions.map((s) => (
            <div
              key={`${s.kind}-${s.depot_id}`}
              className="flex flex-col gap-[8px] rounded-md border border-frost bg-pure-white p-[10px]"
            >
              <div className="text-[12.5px] font-bold leading-[1.35] text-midnight-ink">
                {describeSuggestion(s)}
              </div>
              <div className="flex items-center justify-between gap-8">
                <span className="text-[11.5px] font-medium text-steel">
                  Cakupan{" "}
                  <b className="tabular-nums text-midnight-ink">
                    {formatNumber(s.coverage_before_pct, 1)}%
                  </b>{" "}
                  menjadi{" "}
                  <b className="tabular-nums text-[#15803d]">
                    {formatNumber(s.coverage_after_pct, 1)}%
                  </b>
                  {s.unserved_points_after === 0
                    ? ", semua titik tuntas"
                    : `, ${s.unserved_points_after} titik tersisa`}
                </span>
                <button
                  type="button"
                  onClick={() => toast.success(`${onApplySuggestion(s)} Jalankan optimasi lagi untuk mencoba.`)}
                  className="font-manrope flex-shrink-0 cursor-pointer rounded-md border border-frost bg-pure-white px-[10px] py-[5px] text-[11.5px] font-bold text-midnight-ink transition-colors hover:bg-mist"
                >
                  Terapkan
                </button>
              </div>
            </div>
          ))}
          <p className="m-0 text-[10.5px] font-medium leading-[1.4] text-slate">
            Perkiraan: unit atau jam tambahan hanya diisi dengan sisa pekerjaan, rencana belum
            dioptimasi ulang, jadi hasil sebenarnya bisa lebih baik.
          </p>
        </section>
      ) : null}

      <ul className="m-0 flex list-none flex-col gap-[8px] p-0">
        {open.map((u) => {
          const share = u.demand_l > 0 ? Math.min(100, (u.remaining_l / u.demand_l) * 100) : 100;
          return (
            <li key={u.flood_id}>
              <button
                type="button"
                onClick={() => onSelectFlood(u.flood_id)}
                title="Buka detail genangan"
                className="font-manrope flex w-full cursor-pointer flex-col gap-[6px] rounded-md border border-frost bg-pure-white px-[12px] py-[10px] text-left transition-colors hover:bg-mist"
              >
                <div className="flex items-center gap-[8px]">
                  <span
                    aria-hidden
                    className="inline-block h-[10px] w-[10px] flex-shrink-0 rounded-full"
                    style={{ background: siColor(u.si_value ?? DEFAULT_SI) }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-midnight-ink">
                    {u.name}
                  </span>
                  <span
                    className={`flex-shrink-0 rounded-md px-[7px] py-px text-[10.5px] font-bold ${REASON_TONE[u.reason]}`}
                  >
                    {REASON_LABEL[u.reason]}
                  </span>
                </div>
                <div className="flex items-center gap-[8px]">
                  <span className="block h-[4px] flex-1 overflow-hidden rounded-full bg-frost">
                    <span
                      className="block h-full rounded-full bg-[#b45309]"
                      style={{ width: `${share}%` }}
                    />
                  </span>
                  <span className="flex-shrink-0 text-[11px] font-semibold tabular-nums text-steel">
                    sisa {formatNumber(u.remaining_l)} dari {formatNumber(u.demand_l)} L
                  </span>
                </div>
                <p className="m-0 text-[11.5px] font-medium leading-[1.45] text-slate">{u.detail}</p>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
