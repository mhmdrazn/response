const MONTH_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Format an ISO-ish datetime string as `24 Mei 2026 · 08:42` (Bahasa Indonesia,
 * 24-hour clock). Returns null when input is missing or unparseable.
 */
export function formatDateTimeId(input: string | null | undefined): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MONTH_ID[d.getMonth()]} ${d.getFullYear()} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Same format but date-only, no time. */
export function formatDateId(input: string | null | undefined): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MONTH_ID[d.getMonth()]} ${d.getFullYear()}`;
}
