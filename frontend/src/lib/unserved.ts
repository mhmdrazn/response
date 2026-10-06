import type { Suggestion, UnservedReason } from "../types";
import { formatNumber } from "./format-metrics";

/** Short Indonesian name of why a point was left unfinished. */
export const REASON_LABEL: Record<UnservedReason, string> = {
  no_unit: "Tanpa unit",
  out_of_range: "Di luar jangkauan",
  far: "Jarak jauh",
  capacity: "Kapasitas habis",
  priority: "Prioritas rendah",
  unscheduled: "Belum dijadwalkan",
};

/** One line saying what a suggestion does. */
export function describeSuggestion(s: Suggestion): string {
  return s.kind === "add_unit"
    ? `Tambah 1 unit (${formatNumber(s.capacity_l ?? 0)} L) di ${s.depot_name}`
    : `Perpanjang jam operasional ${s.depot_name} ${formatNumber(s.extra_minutes ?? 0)} menit`;
}
