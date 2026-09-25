"""Project what the empirical pumping workload does to coverage.

Reads nothing new and writes nothing: it rebuilds the instance in memory at
several workload scales and reports what each solver achieves inside the time
cap. Use it to decide how to present Tahap A before committing to the data.

    python scripts/simulate_workload.py
    python scripts/simulate_workload.py --minutes 268 --time-limit 45
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.algorithms.acs import ACSParams, HybridACS
from app.algorithms.evaluator import coverage_ratio
from app.algorithms.instance import (
    IF_DRAIN_S,
    PUMP_RATE_LPS,
    SERVICE_SETUP_S,
    VEHICLE_CAPACITIES_L,
    build_instance,
)
from app.algorithms.vns import VNS, VNSParams
from app.data.store import store
from app.severity.index import compute_severity_index


def pumping_minutes(on_scene_min: float, cycle_s: float, capacity_l: int) -> float:
    """Strip the IF shuttle out of recorded on-scene time.

    On-scene time covers pumping plus repeated drives to an IF and back. The
    optimiser already models those trips, so only the pumping share may become
    demand, or the shuttle is counted twice.

        T = setup + T_pump + (Q * T_pump / C) * cycle
    """
    usable_s = max(0.0, on_scene_min * 60.0 - SERVICE_SETUP_S)
    return usable_s / (1.0 + PUMP_RATE_LPS * cycle_s / capacity_l) / 60.0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenario", default="s2-jun")
    ap.add_argument("--minutes", type=float, default=268.0, help="median on-scene minutes")
    ap.add_argument("--time-limit", type=float, default=45.0)
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args()

    bundle = store.get(args.scenario)
    sev = compute_severity_index(bundle.floods, bundle.faskes)

    def make(volume_l: float | None):
        inst = build_instance(
            depots_df=bundle.depots,
            floods_df=bundle.floods,
            ifs_df=bundle.ifs,
            dist_matrix=bundle.distance_matrix,
            time_matrix=bundle.time_matrix,
            si_values=sev.si_values,
        )
        if volume_l is not None:
            inst.volumes = np.full(inst.n_floods, volume_l, dtype=float)
        return inst

    base = make(None)
    travel = base.time_matrix[np.ix_(base.flood_indices, base.if_indices)].min(axis=1)
    cycle_s = 2.0 * float(np.median(travel)) + IF_DRAIN_S
    cap = int(np.mean(VEHICLE_CAPACITIES_L))

    print(f"skenario {args.scenario}: {base.n_floods} titik, {len(base.vehicles)} kendaraan")
    print(f"siklus buang IF   : {cycle_s:.0f} s ({cycle_s / 60:.1f} menit)")
    print(f"debit pompa       : {PUMP_RATE_LPS * 60:.0f} L/menit")
    print(f"tangki rata-rata  : {cap} L")
    print()

    t_pump = pumping_minutes(args.minutes, cycle_s, cap)
    share = t_pump / args.minutes * 100
    print(
        f"waktu di lokasi {args.minutes:.0f} mnt -> memompa {t_pump:.0f} mnt "
        f"({share:.0f}%), sisanya siklus buang"
    )
    print()

    scales = [
        ("sekarang (100 L/cm)", None),
        ("p25  67 mnt di lokasi", pumping_minutes(67.0, cycle_s, cap)),
        ("p50 268 mnt di lokasi", t_pump),
        ("p75 382 mnt di lokasi", pumping_minutes(382.0, cycle_s, cap)),
    ]

    header = f"{'beban':<24}{'V per titik':>13}{'total':>12}{'ACS':>18}{'VNS':>18}"
    print(header)
    print("-" * len(header))

    for label, pump_min in scales:
        volume = None if pump_min is None else pump_min * 60.0 * PUMP_RATE_LPS
        out = []
        for solver_name in ("acs", "vns"):
            inst = make(volume)
            t0 = time.perf_counter()
            if solver_name == "acs":
                sol = HybridACS(
                    inst,
                    ACSParams(iterations=60, n_ants=20, seed=args.seed,
                              time_limit_s=args.time_limit),
                ).solve()
            else:
                sol = VNS(
                    inst,
                    VNSParams(max_iterations=100, seed=args.seed,
                              time_limit_s=args.time_limit),
                ).solve()
            elapsed = time.perf_counter() - t0
            out.append(f"{coverage_ratio(inst, sol.evaluation) * 100:5.1f}% / {elapsed:4.1f}s")

        inst = make(volume)
        per_point = inst.volumes.mean()
        total = inst.volumes.sum()
        print(
            f"{label:<24}{per_point / 1000:9.1f} m3{total / 1_000_000:9.2f} jt L"
            f"{out[0]:>18}{out[1]:>18}"
        )


if __name__ == "__main__":
    main()
