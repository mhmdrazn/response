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

from app.config import scenario_floods_path
from app.data import loaders, registry
from app.preprocessing import workload


def backfill(scenario_id: str, dry_run: bool) -> None:
    floods = loaders.load_floods(scenario_floods_path(scenario_id))
    n_f = len(floods)
    volumes = workload.volumes_for_points(
        depths_cm=floods["ketinggian_cm"].to_numpy(),
        road_classes=floods.get("road_class", pd.Series([np.nan] * n_f)).to_numpy(),
    )
    print(
        f"[{scenario_id}] {n_f} titik | volume median {np.median(volumes) / 1000:.1f} m3"
        f", total {volumes.sum() / 1_000_000:.2f} jt L"
        f", rit rata-rata {np.mean(volumes) / 4000:.1f}"
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
