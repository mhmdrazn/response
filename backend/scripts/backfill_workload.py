"""Add the `volume_l` column to scenarios built before Tahap A.

Uses each scenario's stored travel-time matrix, so it needs no OSRM or Overpass
call and cannot disturb the matrices themselves.

    python scripts/backfill_workload.py            # every scenario
    python scripts/backfill_workload.py s2-jun     # one scenario
    python scripts/backfill_workload.py --dry-run
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import SHARED_FILES, scenario_floods_path, scenario_matrix_paths
from app.data import loaders, registry
from app.preprocessing import workload


def backfill(scenario_id: str, dry_run: bool) -> None:
    floods = loaders.load_floods(scenario_floods_path(scenario_id))
    ifs = loaders.load_ifs(SHARED_FILES["if"])
    depots = loaders.load_depots(SHARED_FILES["depo"])

    _, tpath = scenario_matrix_paths(scenario_id)
    if not tpath.exists():
        print(f"[{scenario_id}] lewati: {tpath.name} tidak ada")
        return
    time_m = np.load(tpath)

    n_d, n_f, n_i = len(depots), len(floods), len(ifs)
    if time_m.shape != (n_d + n_f + n_i,) * 2:
        print(f"[{scenario_id}] lewati: matriks {time_m.shape} != {n_d}+{n_f}+{n_i}")
        return

    dates = set(
        pd.to_datetime(floods["datetime"], errors="coerce").dt.strftime("%Y-%m-%d").dropna()
    )
    table = workload.calibrate_on_scene(exclude_dates=dates)
    volumes = workload.volumes_for_points(
        depths_cm=floods["ketinggian_cm"].to_numpy(),
        time_flood_to_if=time_m[n_d:n_d + n_f, n_d + n_f:],
        if_waterway_types=ifs.get("waterway_type", pd.Series([""] * n_i)).tolist(),
        table=table,
    )

    print(
        f"[{scenario_id}] {n_f} titik | holdout {len(dates)} hari | "
        f"volume median {np.median(volumes) / 1000:.1f} m3, "
        f"total {volumes.sum() / 1_000_000:.2f} jt L"
    )
    if dry_run:
        return

    path = scenario_floods_path(scenario_id)
    out = pd.read_csv(path)
    if len(out) != n_f:
        print(f"[{scenario_id}] lewati: {len(out)} baris mentah != {n_f} termuat")
        return
    out["volume_l"] = np.round(volumes, 1)
    out.to_csv(path, index=False)
    print(f"[{scenario_id}] ditulis -> {path.name}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("scenarios", nargs="*", help="default: semua dari manifest")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    ids = args.scenarios or registry.scenario_ids()
    for sid in ids:
        backfill(sid, args.dry_run)


if __name__ == "__main__":
    main()
