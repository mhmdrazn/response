"""OSRM distance/time matrices over all model nodes.

Node order MUST match instance.py: [depots, floods, ifs]. Query the OSRM Table
service block by block; any cell OSRM cannot answer falls back to a Manhattan
estimate (consistent with algorithms/geo.py). Ported NB7.
"""

from __future__ import annotations

import time

import numpy as np
import pandas as pd
import requests

from app.config import EARTH_RADIUS_M, OSRM_BLOCK_SIZE, OSRM_URL


def _node_coords(depots: pd.DataFrame, floods: pd.DataFrame, ifs: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    lats = np.concatenate([depots["lat"].to_numpy(), floods["lat"].to_numpy(), ifs["lat"].to_numpy()])
    lons = np.concatenate([depots["lon"].to_numpy(), floods["lon"].to_numpy(), ifs["lon"].to_numpy()])
    return lats.astype(float), lons.astype(float)


def _osrm_table(coord_str: str, src: list[int], dst: list[int], retries: int = 3):
    url = (
        f"{OSRM_URL}/table/v1/driving/{coord_str}"
        f"?sources={';'.join(map(str, src))}&destinations={';'.join(map(str, dst))}"
        f"&annotations=distance,duration"
    )
    for _ in range(retries):
        try:
            data = requests.get(url, timeout=60).json()
            if data.get("code") == "Ok":
                return data["distances"], data["durations"]
        except Exception:
            pass
        time.sleep(5)
    return None, None


def _manhattan(lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    lat_r, lon_r = np.deg2rad(lats), np.deg2rad(lons)
    cos_avg = np.cos(lat_r.mean())
    return EARTH_RADIUS_M * (
        np.abs(lat_r[:, None] - lat_r[None, :]) + np.abs(lon_r[:, None] - lon_r[None, :]) * cos_avg
    )


def build_matrices(
    depots: pd.DataFrame, floods: pd.DataFrame, ifs: pd.DataFrame, *, delay_s: float = 1.0
) -> tuple[np.ndarray, np.ndarray]:
    lats, lons = _node_coords(depots, floods, ifs)
    n = len(lats)
    coord_str = ";".join(f"{lo:.6f},{la:.6f}" for la, lo in zip(lats, lons))  # OSRM: lon,lat

    dist = np.full((n, n), np.nan)
    time_m = np.full((n, n), np.nan)
    blocks = [list(range(i, min(i + OSRM_BLOCK_SIZE, n))) for i in range(0, n, OSRM_BLOCK_SIZE)]
    for sb in blocks:
        for db in blocks:
            ds, du = _osrm_table(coord_str, sb, db)
            if ds is not None:
                for si, s in enumerate(sb):
                    for di, d in enumerate(db):
                        dist[s, d] = ds[si][di]
                        time_m[s, d] = du[si][di]
            time.sleep(delay_s)

    man = _manhattan(lats, lons)
    dist[np.isnan(dist)] = man[np.isnan(dist)]
    time_m[np.isnan(time_m)] = (man / (30_000 / 3600))[np.isnan(time_m)]  # 30 km/h fallback
    np.fill_diagonal(dist, 0.0)
    np.fill_diagonal(time_m, 0.0)
    return dist, time_m
