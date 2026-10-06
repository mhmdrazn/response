/** Severity-index priorities: how much each factor counts toward a flood point's urgency. */

export type PriorityWeights = [number, number, number];

export interface PriorityCriterion {
  id: "depth" | "road" | "clinic";
  label: string;
  /** One line on what raising it does. */
  hint: string;
}

/** In the order the backend takes its weights. */
export const PRIORITY_CRITERIA: PriorityCriterion[] = [
  {
    id: "depth",
    label: "Tinggi genangan",
    hint: "Makin dalam air di jalan, makin mendesak.",
  },
  {
    id: "road",
    label: "Kelas jalan",
    hint: "Jalan yang lebih besar dan ramai lebih diutamakan.",
  },
  {
    id: "clinic",
    label: "Kedekatan faskes",
    hint: "Titik yang dekat rumah sakit atau klinik lebih diutamakan.",
  },
];

export interface PriorityState {
  mode: "default" | "custom";
  /** Slider values, 0-100 each; only the ratios matter. */
  weights: PriorityWeights;
}

export const DEFAULT_PRIORITY: PriorityState = { mode: "default", weights: [50, 30, 20] };

export const PRIORITY_PRESETS: { id: string; label: string; weights: PriorityWeights }[] = [
  { id: "balanced", label: "Seimbang", weights: [34, 33, 33] },
  { id: "depth", label: "Utamakan tinggi air", weights: [60, 20, 20] },
  { id: "road", label: "Utamakan jalan utama", weights: [20, 60, 20] },
  { id: "clinic", label: "Utamakan faskes", weights: [20, 20, 60] },
];

/** The weights to send with a request, or null for the default AHP + entropy mix. */
export function priorityPayload(p: PriorityState): number[] | null {
  if (p.mode !== "custom") return null;
  return p.weights.some((w) => w > 0) ? [...p.weights] : null;
}

/** Slider values as shares of 100. */
export function toShares(weights: readonly number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  return total > 0 ? weights.map((w) => (w / total) * 100) : weights.map(() => 100 / weights.length);
}

export function samePriority(a: PriorityState, b: PriorityState): boolean {
  return a.mode === b.mode && a.weights.every((w, i) => w === b.weights[i]);
}
