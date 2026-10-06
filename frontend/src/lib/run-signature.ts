import type { Depot, Faskes, FloodPoint, IntermediateFacility, RunExtras } from "../types";

/**
 * What a result was computed from, split by the setting that changes it. Saved with
 * the result and compared with the current settings, it says which changes the
 * result does not yet reflect.
 */
export type SettingGroup = "fleet" | "priority" | "algorithm" | "budget" | "data";

export type RunSignature = Record<SettingGroup, string>;

export const GROUP_LABEL: Record<SettingGroup, string> = {
  fleet: "Armada & depo",
  priority: "Prioritas keparahan",
  algorithm: "Parameter algoritma",
  budget: "Anggaran komputasi",
  data: "Data genangan",
};

/** Small, stable string hash (FNV-1a); enough to tell two settings apart. */
export function hashString(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export interface MapDataset {
  floods: FloodPoint[];
  depots: Depot[];
  ifs: IntermediateFacility[];
  faskes: Faskes[];
}

/** Everything in the map data that feeds the optimisation, as one hash. */
export function hashDataset(d: MapDataset): string {
  const point = (p: { id: string; lat: number; lon: number }) => `${p.id}:${p.lat}:${p.lon}`;
  return hashString(
    [
      d.floods.map((f) => `${point(f)}:${f.ketinggian_cm ?? ""}:${f.volume_l ?? ""}`).join("|"),
      d.depots.map(point).join("|"),
      d.ifs.map(point).join("|"),
      d.faskes.length,
    ].join("#"),
  );
}

interface SignatureInput extends RunExtras {
  acsParams: object;
  vnsParams: object;
  budgetS: number;
  dataKey: string;
}

export function buildSignature(i: SignatureInput): RunSignature {
  return {
    fleet: hashString(JSON.stringify(i.fleet ?? null)),
    priority: hashString(JSON.stringify(i.severity_weights ?? null)),
    algorithm: hashString(JSON.stringify([i.acsParams, i.vnsParams])),
    budget: String(i.budgetS),
    data: i.dataKey,
  };
}

/** The settings that differ between a saved result and now, in a fixed order. */
export function changedGroups(saved: RunSignature, now: RunSignature): SettingGroup[] {
  return (Object.keys(GROUP_LABEL) as SettingGroup[]).filter((g) => saved[g] !== now[g]);
}
