"use client";

import { useCallback, useMemo, useState } from "react";

import type { Depot, IntermediateFacility } from "../types";

export interface Closures {
  /** Depots switched off for the next run. */
  disabledDepots: ReadonlySet<string>;
  /** Outlets that cannot take water for the next run. */
  closedIfs: ReadonlySet<string>;
  toggleDepot: (id: string) => void;
  toggleIf: (id: string) => void;
  clear: () => void;
  /** For the run request; empty lists when nothing is closed. */
  payload: { disabled_depots: string[]; closed_ifs: string[] };
}

function toggled(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * Facilities taken out of service for the run (a depot without a crew, a river
 * that has overflowed). Depots and outlets are shared by every scenario, so this
 * survives a scenario change; ids no longer in the data are dropped.
 */
export function useClosures(depots: Depot[], ifs: IntermediateFacility[]): Closures {
  const [rawDepots, setRawDepots] = useState<ReadonlySet<string>>(() => new Set());
  const [rawIfs, setRawIfs] = useState<ReadonlySet<string>>(() => new Set());

  const disabledDepots = useMemo(() => {
    const ids = new Set(depots.map((d) => d.id));
    return new Set([...rawDepots].filter((id) => ids.has(id)));
  }, [rawDepots, depots]);
  const closedIfs = useMemo(() => {
    const ids = new Set(ifs.map((f) => f.id));
    return new Set([...rawIfs].filter((id) => ids.has(id)));
  }, [rawIfs, ifs]);

  const toggleDepot = useCallback((id: string) => setRawDepots((s) => toggled(s, id)), []);
  const toggleIf = useCallback((id: string) => setRawIfs((s) => toggled(s, id)), []);
  const clear = useCallback(() => {
    setRawDepots(new Set());
    setRawIfs(new Set());
  }, []);

  const payload = useMemo(
    () => ({ disabled_depots: [...disabledDepots].sort(), closed_ifs: [...closedIfs].sort() }),
    [disabledDepots, closedIfs],
  );

  return { disabledDepots, closedIfs, toggleDepot, toggleIf, clear, payload };
}
