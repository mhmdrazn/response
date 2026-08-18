# Distance/time matrix builders
# Manhattan fallback: |Δlat| + |Δlon|*cos(avg_lat), better for grid-like streets
# Travel time assumes 30 km/h city speed

from __future__ import annotations

import numpy as np

EARTH_RADIUS_M = 6_371_000.0
CITY_SPEED_MPS = 30_000 / 3600  # 30 km/h in m/s


def haversine_matrix(lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    lat_r = np.deg2rad(lats.astype(float))
    lon_r = np.deg2rad(lons.astype(float))
    dlat = lat_r[:, None] - lat_r[None, :]
    dlon = lon_r[:, None] - lon_r[None, :]
    a = (
        np.sin(dlat / 2.0) ** 2
        + np.cos(lat_r[:, None]) * np.cos(lat_r[None, :]) * np.sin(dlon / 2.0) ** 2
    )
    c = 2 * np.arcsin(np.clip(np.sqrt(a), 0, 1))
    return EARTH_RADIUS_M * c


def manhattan_matrix(lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    # d(A,B) = R * (|Δlat| + |Δlon| * cos(avg_lat))
    lat_r = np.deg2rad(lats.astype(float))
    lon_r = np.deg2rad(lons.astype(float))

    avg_lat = np.mean(lat_r)
    cos_avg = np.cos(avg_lat)

    dlat = np.abs(lat_r[:, None] - lat_r[None, :])
    dlon = np.abs(lon_r[:, None] - lon_r[None, :]) * cos_avg

    return EARTH_RADIUS_M * (dlat + dlon)


def time_matrix_from_distance(
    dist_m: np.ndarray, speed_mps: float = CITY_SPEED_MPS
) -> np.ndarray:
    return dist_m / speed_mps
