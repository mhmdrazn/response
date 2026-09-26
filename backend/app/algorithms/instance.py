# Unified node index: [0..n_depots) depots, [n_depots..+n_floods) floods, [..total) IFs

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
PUMP_RATE_LPS = 2000 / 60.0    # 2000 L/min ≈ 33.33 L/s, per Damkar pump spec
SERVICE_SETUP_S = 60.0
IF_DRAIN_S = 120.0

# Discharging is faster where the outlet is a large river with room to work than
# at a narrow stream, so the base drain time is scaled per IF. Keys are
# `waterway_type` in if.csv; anything unlisted falls back to 1.0.
IF_DRAIN_FACTOR = {"river": 0.75, "stream": 1.25}

# Longest deployment observed in the Damkar log (berangkat -> tiba_pangkalan,
# 930 min over 408 records). A route may not outlast one real deployment;
# without it the solvers buy coverage with 23-hour tours.
ROUTE_HORIZON_S = 930 * 60.0

# Cost per second a route runs past the horizon. Work past it already earns
# nothing, but that only makes overtime worthless, not costly — local search
# would still lengthen a route when some other part of the move improved.
# One extra second buys at most one second of pumping, worth at most
# UNSERVED_PENALTY * max(SI) = 500; ten times that leaves no room to trade.
HORIZON_PENALTY = 5000.0

# Weight on severity-weighted pumping work left undone. Both terms of the
# objective are in severity-seconds, so this stays dimensionless. Calibrated on
# s2-jun: at 100 the solvers settled for 99.3% coverage that was achievable, at
# 500 they close it. Lower it deliberately to study the coverage/priority
# trade-off, not as a default.
UNSERVED_PENALTY = 500.0

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

    # (n_ifs,) seconds to empty a tank, per IF outlet
    if_drain_s: np.ndarray

    # Matrices addressed on the full node space
    dist_matrix: np.ndarray        # (n_total, n_total) meters
    time_matrix: np.ndarray        # (n_total, n_total) seconds

    # Convenience index ranges
    depot_indices: list[int] = field(default_factory=list)
    flood_indices: list[int] = field(default_factory=list)
    if_indices: list[int] = field(default_factory=list)

    # Vehicles: each entry is (depot_node_index, capacity_liters)
    vehicles: list[tuple[int, int]] = field(default_factory=list)

    # Soft-constraint weight for unserved pumping work.
    unserved_penalty: float = UNSERVED_PENALTY

    # Seconds a single vehicle may stay deployed on one route, and the cost of
    # each second beyond it.
    route_horizon_s: float = ROUTE_HORIZON_S
    horizon_penalty: float = HORIZON_PENALTY

    # Geometry constraint: each flood assigned to its nearest depot
    nearest_depot: np.ndarray = field(default_factory=lambda: np.array([], dtype=int))
    # Quick lookup: depot_node_index -> set of flood node indices assigned to it
    depot_flood_sets: dict[int, set[int]] = field(default_factory=dict)


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
    unserved_penalty: float = UNSERVED_PENALTY,
    route_horizon_s: float = ROUTE_HORIZON_S,
    horizon_penalty: float = HORIZON_PENALTY,
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

    if_drain_s = np.array(
        [
            IF_DRAIN_S * IF_DRAIN_FACTOR.get(str(f.get("waterway_type") or ""), 1.0)
            for f in ifs
        ],
        dtype=float,
    )

    # Each depot gets one vehicle per capacity type.
    vehicles: list[tuple[int, int]] = []
    for di in depot_indices:
        for cap in VEHICLE_CAPACITIES_L:
            vehicles.append((di, cap))

    # Geometry constraint: assign each flood to its nearest depot
    depot_arr = np.array(depot_indices, dtype=int)
    flood_arr = np.array(flood_indices, dtype=int)
    if n_depots > 0 and n_floods > 0:
        sub = dist_matrix[np.ix_(flood_arr, depot_arr)]
        nearest_depot = depot_arr[np.argmin(sub, axis=1)]
    else:
        nearest_depot = np.zeros(n_floods, dtype=int)

    depot_flood_sets: dict[int, set[int]] = {di: set() for di in depot_indices}
    for k, fi in enumerate(flood_indices):
        depot_flood_sets[int(nearest_depot[k])].add(fi)

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
        if_drain_s=if_drain_s,
        dist_matrix=dist_matrix.astype(float),
        time_matrix=time_matrix.astype(float),
        depot_indices=depot_indices,
        flood_indices=flood_indices,
        if_indices=if_indices,
        vehicles=vehicles,
        unserved_penalty=float(unserved_penalty),
        route_horizon_s=float(route_horizon_s),
        horizon_penalty=float(horizon_penalty),
        nearest_depot=nearest_depot,
        depot_flood_sets=depot_flood_sets,
    )
