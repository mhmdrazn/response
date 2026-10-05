/** OSM tag values rendered in Bahasa Indonesia. Unknown values fall back to a
 *  Title-Cased raw value so freshly scraped data still reads cleanly. */

const HIGHWAY_LABELS: Record<string, string> = {
  motorway: "Tol",
  motorway_link: "Rampa Tol",
  trunk: "Arteri Primer",
  trunk_link: "Rampa Arteri Primer",
  primary: "Arteri",
  primary_link: "Rampa Arteri",
  secondary: "Kolektor",
  secondary_link: "Rampa Kolektor",
  tertiary: "Lokal",
  tertiary_link: "Rampa Lokal",
  unclassified: "Tidak Terklasifikasi",
  residential: "Perumahan",
  service: "Jalan Layanan",
  living_street: "Jalan Perumahan",
  pedestrian: "Pejalan Kaki",
  track: "Jalan Tanah",
};

const WATERWAY_LABELS: Record<string, string> = {
  river: "Sungai",
  stream: "Kali",
  canal: "Kanal",
  drain: "Drainase",
  ditch: "Parit",
  brook: "Anak Sungai",
};

const HEALTHCARE_LABELS: Record<string, string> = {
  clinic: "Klinik",
  doctor: "Praktik Dokter",
  doctors: "Praktik Dokter",
  hospital: "Rumah Sakit",
  pharmacy: "Apotek",
  dentist: "Dokter Gigi",
  optometrist: "Optik",
  physiotherapist: "Fisioterapi",
  midwife: "Bidan",
  laboratory: "Laboratorium",
  alternative: "Pengobatan Alternatif",
  centre: "Pusat Kesehatan",
  yes: "Fasilitas Kesehatan",
};

function toTitleCase(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function localize(table: Record<string, string>, v: string | null | undefined): string | null {
  if (!v) return null;
  return table[v.toLowerCase().trim()] ?? toTitleCase(v);
}

export const localizeHighway = (v: string | null | undefined) => localize(HIGHWAY_LABELS, v);
export const localizeWaterway = (v: string | null | undefined) => localize(WATERWAY_LABELS, v);
export const localizeHealthcare = (v: string | null | undefined) => localize(HEALTHCARE_LABELS, v);
