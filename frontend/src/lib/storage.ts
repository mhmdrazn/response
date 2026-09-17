// Small, SSR-safe wrappers around window.localStorage. Every access is guarded
// (localStorage can throw in private mode / when disabled, and is undefined on
// the server), so callers get a plain value or a fallback and never a crash.

/** Read and JSON-parse a key, returning `fallback` on any failure. */
export function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** JSON-stringify and write a value; silently no-ops on failure. */
export function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded or storage unavailable */
  }
}

/** Remove a key; silently no-ops on failure. */
export function removeKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Read a key as a Set<string> (persisted as a JSON array). */
export function readStringSet(key: string): Set<string> {
  const arr = readJSON<unknown>(key, null);
  if (Array.isArray(arr)) return new Set(arr.filter((v): v is string => typeof v === "string"));
  return new Set();
}

/** Persist a Set<string> as a JSON array. */
export function writeStringSet(key: string, value: Set<string>): void {
  writeJSON(key, Array.from(value));
}
