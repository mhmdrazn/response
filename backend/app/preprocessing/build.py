"""Orchestrate one scenario end to end: points -> road_class -> dist_faskes ->
floods.csv (backend schema) -> OSRM matrices -> update manifest.
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd

from app.config import (
    MANIFEST_PATH,
    SCENARIOS_DIR,
    SHARED_FILES,
    scenario_dir,
    scenario_floods_path,
    scenario_matrix_paths,
)
from app.data import loaders
from app.preprocessing import faskes, matrix, roads, workload


def _to_backend_schema(points: pd.DataFrame, road_class: list[int], dist_faskes: list[float]) -> pd.DataFrame:
    return pd.DataFrame({
        "Datetime": pd.to_datetime(points.get("datetime"), errors="coerce").dt.strftime("%Y-%m-%d %H:%M:%S"),
        "Latitude": points["lat"].to_numpy(),
        "Longitude": points["lon"].to_numpy(),
        "Deskripsi": points.get("detail", points.get("jalan", "")),
        "Images": "",
        "Ketinggian (cm)": points["depth_cm"].to_numpy(),
        "road_class": pd.Series(road_class, dtype=int),
        "dist_faskes_m": np.round(dist_faskes, 2),
        "volume_l": np.round(
            workload.volumes_for_points(
                points["depth_cm"].to_numpy(), np.asarray(road_class, dtype=float)
            ),
            1,
        ),
    })


def _update_manifest(meta: dict) -> None:
    if MANIFEST_PATH.exists():
        data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    else:
        data = {"default": meta["id"], "scenarios": []}
    scenarios = [s for s in data.get("scenarios", []) if s.get("id") != meta["id"]]
    scenarios.append(meta)
    scenarios.sort(key=lambda s: s["id"])
    data["scenarios"] = scenarios
    data.setdefault("default", meta["id"])
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_scenario(
    scenario_id: str,
    points: pd.DataFrame,
    *,
    name: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    description: str | None = None,
    roads_utm=None,
) -> dict:
    depots = loaders.load_depots(SHARED_FILES["depo"])
    ifs = loaders.load_ifs(SHARED_FILES["if"])
    faskes_df = loaders.load_faskes(SHARED_FILES["faskes"])

    print(f"[{scenario_id}] {len(points)} titik -> road_class ...")
    road_class = roads.classify_points(points, roads_utm)
    print(f"[{scenario_id}] dist_faskes (OSRM) ...")
    dist_faskes = faskes.dist_to_faskes(points, faskes_df)

    out_dir = scenario_dir(scenario_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    _to_backend_schema(points, road_class, dist_faskes).to_csv(scenario_floods_path(scenario_id), index=False)

    # Reload through the canonical loader so matrix order/count matches runtime.
    floods = loaders.load_floods(scenario_floods_path(scenario_id))
    print(f"[{scenario_id}] matriks OSRM {len(depots)}+{len(floods)}+{len(ifs)} ...")
    dist, time_m = matrix.build_matrices(depots, floods, ifs)
    dpath, tpath = scenario_matrix_paths(scenario_id)
    np.save(dpath, dist)
    np.save(tpath, time_m)

    meta = {
        "id": scenario_id,
        "name": name or scenario_id,
        "date_from": date_from,
        "date_to": date_to,
        "n_points": int(len(floods)),
        "description": description,
    }
    _update_manifest(meta)
    print(f"[{scenario_id}] selesai -> {out_dir}  ({len(floods)} titik, matriks {dist.shape})")
    return meta
