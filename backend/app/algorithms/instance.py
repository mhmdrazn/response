"""Assemble the runtime routing instance from the loaded DataFrames.

The MDCVRP-IF-SI instance combines depots, flood points, and IFs into a
single node index space so distance / pheromone matrices can address every
node uniformly:

    indices 0                        .. n_depots - 1              depots
    indices n_depots                 .. n_depots + n_floods - 1   flood points
    indices n_depots + n_floods      .. total - 1                 IFs

Everything algorithm code sees is a plain dict of numpy arrays + lists,
never a DataFrame.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from app.algorithms.geo import (
    CITY_SPEED_MPS,
    manhattan_matrix,
    time_matrix_from_distance,
)


VEHICLE_CAPACITIES_L = [3000, 5000]
DEFAULT_VOLUME_PER_CM = 100.0  # liters pumped per cm of depth (calibration knob)
PUMP_RATE_LPS = 1000 / 60.0    # 1000 L/min ≈ 16.67 L/s
SERVICE_SETUP_S = 60.0
IF_DRAIN_S = 120.0

SBY_LAT_MIN, SBY_LAT_MAX = -7.38, -7.13
SBY_LON_MIN, SBY_LON_MAX = 112.58, 112.87


@dataclass
class Instance:
    # Node metadata
    depots: list[dict[str, Any]]
    floods: list[dict[str, Any]]
    ifs: list[dict[str, Any]]

    # Derived
    n_depots: int
    n_floods: int
    n_ifs: int
    n_total: int

    # Flood-point derived arrays (aligned to flood index in the node space)
    volumes: np.ndarray            # (n_floods,) liters remaining to pump per flood
    si_values: np.ndarray          # (n_floods,) severity index in [0, 1]

    # Matrices addressed on the full node space
    dist_matrix: np.ndarray        # (n_total, n_total) meters
    time_matrix: np.ndarray        # (n_total, n_total) seconds

    # Convenience index ranges
    depot_indices: list[int] = field(default_factory=list)
    flood_indices: list[int] = field(default_factory=list)
    if_indices: list[int] = field(default_factory=list)

    # Vehicles: each entry is (depot_node_index, capacity_liters)
    vehicles: list[tuple[int, int]] = field(default_factory=list)


def _row_to_dict(row: pd.Series) -> dict[str, Any]:
    return {k: (None if pd.isna(v) else v) for k, v in row.to_dict().items()}


def build_instance(
    depots_df: pd.DataFrame,
    floods_df: pd.DataFrame,
    ifs_df: pd.DataFrame,
    dist_matrix: np.ndarray | None = None,
    time_matrix: np.ndarray | None = None,
    si_values: np.ndarray | None = None,
    volume_per_cm: float = DEFAULT_VOLUME_PER_CM,
) -> Instance:
    depots = [_row_to_dict(r) for _, r in depots_df.iterrows()]
    floods = [_row_to_dict(r) for _, r in floods_df.iterrows()]
    ifs = [_row_to_dict(r) for _, r in ifs_df.iterrows()]

    n_depots = len(depots)
    n_floods = len(floods)
    n_ifs = len(ifs)
    n_total = n_depots + n_floods + n_ifs

    depot_indices = list(range(0, n_depots))
    flood_indices = list(range(n_depots, n_depots + n_floods))
    if_indices = list(range(n_depots + n_floods, n_total))

    # Node coordinates in unified order
    lats = np.array(
        [d["lat"] for d in depots]
        + [f["lat"] for f in floods]
        + [f["lat"] for f in ifs],
        dtype=float,
    )
    lons = np.array(
        [d["lon"] for d in depots]
        + [f["lon"] for f in floods]
        + [f["lon"] for f in ifs],
        dtype=float,
    )

    # Validate all coordinates are within the Surabaya bounding box.
    bad_lat = (lats < SBY_LAT_MIN) | (lats > SBY_LAT_MAX) | np.isnan(lats)
    bad_lon = (lons < SBY_LON_MIN) | (lons > SBY_LON_MAX) | np.isnan(lons)
    bad_mask = bad_lat | bad_lon
    if bad_mask.any():
        bad_indices = np.where(bad_mask)[0].tolist()
        details = [
            f"  node {i}: lat={lats[i]:.6f}, lon={lons[i]:.6f}"
            for i in bad_indices[:5]
        ]
        raise ValueError(
            f"{int(bad_mask.sum())} node(s) have coordinates outside Surabaya "
            f"bbox [{SBY_LAT_MIN},{SBY_LAT_MAX}] x [{SBY_LON_MIN},{SBY_LON_MAX}]:\n"
            + "\n".join(details)
        )

    if dist_matrix is None:
        dist_matrix = manhattan_matrix(lats, lons)
    if time_matrix is None:
        time_matrix = time_matrix_from_distance(dist_matrix, CITY_SPEED_MPS)

    # Volumes derived from depth (Ketinggian cm). Missing → assume 20 cm.
    depths = np.array(
        [(f.get("ketinggian_cm") if f.get("ketinggian_cm") is not None else 20.0) for f in floods],
        dtype=float,
    )
    volumes = np.maximum(depths, 5.0) * volume_per_cm  # min 5cm to avoid zeros

    # SI: use externally computed values if available, else placeholder from depth.
    if si_values is None:
        norm = np.clip(depths / 100.0, 0.0, 1.0)
        si_values = norm

    # Each depot gets one vehicle per capacity type.
    vehicles: list[tuple[int, int]] = []
    for di in depot_indices:
        for cap in VEHICLE_CAPACITIES_L:
            vehicles.append((di, cap))

    return Instance(
        depots=depots,
        floods=floods,
        ifs=ifs,
        n_depots=n_depots,
        n_floods=n_floods,
        n_ifs=n_ifs,
        n_total=n_total,
        volumes=volumes.astype(float),
        si_values=si_values.astype(float),
        dist_matrix=dist_matrix.astype(float),
        time_matrix=time_matrix.astype(float),
        depot_indices=depot_indices,
        flood_indices=flood_indices,
        if_indices=if_indices,
        vehicles=vehicles,
    )
