"""Distance to the nearest health facility (indicator C3) via OSRM road network.

Pre-filter the K nearest faskes by Haversine (cheap), then take the smallest
OSRM driving distance among them. Falls back to Haversine if OSRM fails. NB5.
"""

from __future__ import annotations

import time

import numpy as np
import pandas as pd
import requests

from app.config import (
    EARTH_RADIUS_M,
    FASKES_K_CANDIDATES,
    OSRM_URL,
    SHARED_FILES,
)
from app.data import loaders


def _haversine(lat1: float, lon1: float, lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    lat1r, lon1r = np.radians(lat1), np.radians(lon1)
    latr, lonr = np.radians(lats), np.radians(lons)
    dlat = latr - lat1r
    dlon = lonr - lon1r
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1r) * np.cos(latr) * np.sin(dlon / 2) ** 2
    return EARTH_RADIUS_M * 2 * np.arcsin(np.sqrt(a))


def osrm_route_m(lat1: float, lon1: float, lat2: float, lon2: float, retries: int = 3) -> float | None:
    url = f"{OSRM_URL}/route/v1/driving/{lon1:.6f},{lat1:.6f};{lon2:.6f},{lat2:.6f}?overview=false"
    for _ in range(retries):
        try:
            data = requests.get(url, timeout=30).json()
            if data.get("code") == "Ok" and data.get("routes"):
                return float(data["routes"][0]["distance"])
        except Exception:
            pass
        time.sleep(3)
    return None


def dist_to_faskes(
    points: pd.DataFrame, faskes: pd.DataFrame | None = None, *, delay_s: float = 0.5
) -> list[float]:
    """Return dist_faskes_m for each row of `points` (needs lat/lon)."""
    if faskes is None:
        faskes = loaders.load_faskes(SHARED_FILES["faskes"])
    flat = faskes["lat"].to_numpy(dtype=float)
    flon = faskes["lon"].to_numpy(dtype=float)

    out: list[float] = []
    for lat, lon in zip(points["lat"], points["lon"]):
        hav = _haversine(lat, lon, flat, flon)
        cand = np.argsort(hav)[:FASKES_K_CANDIDATES]
        best = np.inf
        for j in cand:
            d = osrm_route_m(lat, lon, float(flat[j]), float(flon[j]))
            if d is not None:
                best = min(best, d)
            time.sleep(delay_s)
        out.append(round(float(hav[cand].min() if best == np.inf else best), 2))
    return out
