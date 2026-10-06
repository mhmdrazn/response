import type { FloodPoint } from "../types";
import { csvToObjects } from "./csv";
import { haversineM } from "./geo";

/** Mirrors the limits in backend/app/models/data.py, so mistakes show before a round trip. */
export const SBY_BOUNDS = { latMin: -7.38, latMax: -7.13, lonMin: 112.58, lonMax: 112.87 };
export const MAX_DEPTH_CM = 300;
export const MAX_VOLUME_L = 2_000_000;
export const MAX_DESCRIPTION = 200;
/** A new point this close to an existing one is the same puddle (backend rejects it too). */
export const DUPLICATE_RADIUS_M = 10;
/** The most points one upload may add; each is routed against the whole network. */
export const MAX_IMPORT_ROWS = 60;

/** Water deeper than this over a road is rare enough to double-check. */
const UNUSUAL_DEPTH_CM = 150;

export interface FloodDraft {
  lat: string;
  lon: string;
  ketinggian: string;
  volume: string;
  deskripsi: string;
}

export interface FloodValues {
  lat: number;
  lon: number;
  ketinggian_cm: number;
  /** Null: let the backend estimate it from depth and road width. */
  volume_l: number | null;
  deskripsi: string | null;
}

export type FieldErrors = Partial<Record<keyof FloodDraft, string>>;

export interface Validation {
  values: FloodValues | null;
  errors: FieldErrors;
  warnings: string[];
}

export const EMPTY_DRAFT: FloodDraft = { lat: "", lon: "", ketinggian: "", volume: "", deskripsi: "" };

/** "12,5" and "12.5" both read as 12.5; anything else is NaN. */
function toNumber(raw: string): number {
  const t = raw.trim().replace(",", ".");
  if (t === "" || !/^-?\d*\.?\d+(e[-+]?\d+)?$/i.test(t)) return NaN;
  return Number(t);
}

export interface PlacedPoint {
  lat: number;
  lon: number;
}

export function validateFloodDraft(draft: FloodDraft, placed: PlacedPoint[]): Validation {
  const errors: FieldErrors = {};
  const warnings: string[] = [];

  const lat = toNumber(draft.lat);
  const lon = toNumber(draft.lon);
  if (Number.isNaN(lat)) errors.lat = "Isi lintang berupa angka.";
  else if (lat < SBY_BOUNDS.latMin || lat > SBY_BOUNDS.latMax)
    errors.lat = `Di luar Surabaya (${SBY_BOUNDS.latMin} s/d ${SBY_BOUNDS.latMax}).`;
  if (Number.isNaN(lon)) errors.lon = "Isi bujur berupa angka.";
  else if (lon < SBY_BOUNDS.lonMin || lon > SBY_BOUNDS.lonMax)
    errors.lon = `Di luar Surabaya (${SBY_BOUNDS.lonMin} s/d ${SBY_BOUNDS.lonMax}).`;

  const depth = toNumber(draft.ketinggian);
  if (draft.ketinggian.trim() === "") errors.ketinggian = "Tinggi genangan wajib diisi.";
  else if (Number.isNaN(depth)) errors.ketinggian = "Isi tinggi genangan (cm) berupa angka.";
  else if (depth <= 0) errors.ketinggian = "Tinggi harus lebih dari 0 cm.";
  else if (depth > MAX_DEPTH_CM) errors.ketinggian = `Maksimal ${MAX_DEPTH_CM} cm.`;
  else if (depth > UNUSUAL_DEPTH_CM) warnings.push(`Tinggi ${depth} cm tidak lazim; pastikan satuannya cm.`);

  let volume: number | null = null;
  if (draft.volume.trim() !== "") {
    const v = toNumber(draft.volume);
    if (Number.isNaN(v)) errors.volume = "Isi volume (liter) berupa angka, atau kosongkan.";
    else if (v < 0) errors.volume = "Volume tidak boleh negatif.";
    else if (v > MAX_VOLUME_L) errors.volume = `Maksimal ${MAX_VOLUME_L.toLocaleString("id-ID")} L.`;
    else volume = v;
  }

  const description = draft.deskripsi.trim();
  if (description.length > MAX_DESCRIPTION) errors.deskripsi = `Maksimal ${MAX_DESCRIPTION} karakter.`;

  if (!errors.lat && !errors.lon) {
    const here = { lat, lon };
    const near = placed.find((p) => haversineM(here, p) < DUPLICATE_RADIUS_M);
    if (near) errors.lat = `Berjarak kurang dari ${DUPLICATE_RADIUS_M} m dari titik yang sudah ada.`;
  }

  if (Object.keys(errors).length > 0) return { values: null, errors, warnings };
  return {
    values: {
      lat,
      lon,
      ketinggian_cm: depth,
      volume_l: volume,
      deskripsi: description === "" ? null : description,
    },
    errors,
    warnings,
  };
}

export function toPlaced(floods: FloodPoint[]): PlacedPoint[] {
  return floods.map((f) => ({ lat: f.lat, lon: f.lon }));
}

// --- CSV ---------------------------------------------------------------------

const ALIASES: Record<keyof FloodDraft | "severity", string[]> = {
  lat: ["lat", "latitude", "lintang"],
  lon: ["lon", "lng", "long", "longitude", "bujur"],
  ketinggian: ["ketinggian_cm", "ketinggian", "tinggi", "tinggi_cm", "depth_cm", "depth", "kedalaman"],
  volume: ["volume_l", "volume", "volume_liter", "beban"],
  deskripsi: ["deskripsi", "lokasi", "keterangan", "description", "nama"],
  severity: ["severity", "si", "severity_index"],
};

function pick(headers: string[], key: keyof typeof ALIASES): string | undefined {
  return ALIASES[key].find((a) => headers.includes(a));
}

export interface ImportRow {
  /** Line number in the file, counting the header as line 1. */
  line: number;
  draft: FloodDraft;
  validation: Validation;
  /** Notes that do not block the row. */
  notes: string[];
}

export interface ImportParse {
  /** Set when the file as a whole cannot be used. */
  fileError: string | null;
  rows: ImportRow[];
}

export function parseFloodCsv(text: string, existing: FloodPoint[]): ImportParse {
  const { headers, records } = csvToObjects(text);
  if (headers.length === 0) return { fileError: "File kosong.", rows: [] };

  const cols = {
    lat: pick(headers, "lat"),
    lon: pick(headers, "lon"),
    ketinggian: pick(headers, "ketinggian"),
    volume: pick(headers, "volume"),
    deskripsi: pick(headers, "deskripsi"),
    severity: pick(headers, "severity"),
  };
  const missing = [
    !cols.lat && "lat",
    !cols.lon && "lon",
    !cols.ketinggian && "ketinggian_cm",
  ].filter(Boolean);
  if (missing.length > 0) {
    return {
      fileError: `Kolom wajib tidak ditemukan: ${missing.join(", ")}. Gunakan templat yang tersedia.`,
      rows: [],
    };
  }
  if (records.length === 0) return { fileError: "File tidak berisi baris data.", rows: [] };
  if (records.length > MAX_IMPORT_ROWS) {
    return {
      fileError: `Terlalu banyak baris (${records.length}). Maksimal ${MAX_IMPORT_ROWS} titik per unggahan.`,
      rows: [],
    };
  }

  const placed = toPlaced(existing);
  const rows: ImportRow[] = records.map((rec, i) => {
    const draft: FloodDraft = {
      lat: rec[cols.lat!] ?? "",
      lon: rec[cols.lon!] ?? "",
      ketinggian: rec[cols.ketinggian!] ?? "",
      volume: cols.volume ? (rec[cols.volume] ?? "") : "",
      deskripsi: cols.deskripsi ? (rec[cols.deskripsi] ?? "") : "",
    };
    const validation = validateFloodDraft(draft, placed);
    const notes: string[] = [...validation.warnings];

    const sev = cols.severity ? (rec[cols.severity] ?? "").trim() : "";
    if (sev !== "") {
      const n = toNumber(sev);
      notes.push(
        Number.isNaN(n) || n < 0 || n > 1
          ? "Severity harus 0 sampai 1; diabaikan."
          : "Severity dihitung otomatis; nilai di file diabaikan.",
      );
    }

    // Later rows must not land on top of earlier ones from the same file.
    if (validation.values) placed.push({ lat: validation.values.lat, lon: validation.values.lon });
    return { line: i + 2, draft, validation, notes };
  });

  return { fileError: null, rows };
}

export const CSV_TEMPLATE =
  "lat,lon,ketinggian_cm,volume_l,deskripsi\n" +
  "-7.2575,112.7521,35,,Contoh: Jl. Tunjungan\n" +
  "-7.3012,112.7344,60,18000,Contoh: Jl. Ahmad Yani, volume diisi manual\n";
