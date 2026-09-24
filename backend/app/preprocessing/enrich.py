"""Intake enrichment (Phase 1.5): enrich a single new flood point on demand.

Reuses the same road/faskes logic as the batch build, plus OSRM vectors from the
new point to every existing model node so the scenario matrices stay consistent
after an add/edit. Falls back to Manhattan per cell when OSRM is unavailable.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from app.config import EARTH_RADIUS_M, OSRM_URL
from app.preprocessing import faskes, roads

_log = logging.getLogger("response.enrich")

# Fallback road ordinal when geopandas/road network is unavailable at runtime.
DEFAULT_ROAD_CLASS = 3


def enrich_attrs(lat: float, lon: float, *, faskes_df=None, roads_utm=None) -> tuple[int, float]:
    """Return (road_class, dist_faskes_m) for a single point."""
    one = pd.DataFrame([{"lat": lat, "lon": lon}])
    try:
        road_class = int(roads.classify_points(one, roads_utm)[0])
    except Exception as exc:  # noqa: BLE001 — geopandas missing / no cached network
        _log.warning("road_class enrichment unavailable (%s); using default %d", exc, DEFAULT_ROAD_CLASS)
        road_class = DEFAULT_ROAD_CLASS
    dist_faskes = float(faskes.dist_to_faskes(one, faskes_df)[0])
    return road_class, dist_faskes


def _manhattan_vec(nlat: float, nlon: float, lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    lat_r = np.deg2rad(np.concatenate([[nlat], lats]))
    lon_r = np.deg2rad(np.concatenate([[nlon], lons]))
    cos_avg = np.cos(lat_r.mean())
    return EARTH_RADIUS_M * (np.abs(lat_r[0] - lat_r[1:]) + np.abs(lon_r[0] - lon_r[1:]) * cos_avg)


def _osrm_one_to_many(nlat, nlon, lats, lons, retries: int = 3):
    """OSRM row (new->each) and col (each->new) distances + durations, or None."""
    import httpx

    pts = [(nlat, nlon)] + list(zip(lats, lons))
    coords = ";".join(f"{lo:.6f},{la:.6f}" for la, lo in pts)
    n = len(lats)
    dst = ";".join(str(i) for i in range(1, n + 1))
    url = f"{OSRM_URL}/table/v1/driving/{coords}?sources=0;{dst}&destinations=0;{dst}&annotations=distance,duration"
    for _ in range(retries):
        try:
            data = httpx.get(url, timeout=60).json()
            if data.get("code") == "Ok":
                d = np.array(data["distances"], dtype=float)
                t = np.array(data["durations"], dtype=float)
                # index 0 = new node; 1..n = existing (in given order)
                return d[0, 1:], d[1:, 0], t[0, 1:], t[1:, 0]
        except Exception:
            pass
    return None


def node_vectors(
    nlat: float, nlon: float, lats: np.ndarray, lons: np.ndarray
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """(row_dist, col_dist, row_time, col_time) new<->existing nodes. OSRM with
    Manhattan fallback for any missing cell."""
    man = _manhattan_vec(nlat, nlon, lats, lons)
    man_t = man / (30_000 / 3600)  # 30 km/h fallback

    osrm = _osrm_one_to_many(nlat, nlon, lats, lons)
    if osrm is None:
        return man, man.copy(), man_t, man_t.copy()

    row_d, col_d, row_t, col_t = osrm
    row_d = np.where(np.isnan(row_d), man, row_d)
    col_d = np.where(np.isnan(col_d), man, col_d)
    row_t = np.where(np.isnan(row_t), man_t, row_t)
    col_t = np.where(np.isnan(col_t), man_t, col_t)
    return row_d, col_d, row_t, col_t
