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

# A route may not outlast one real deployment, or the solvers buy coverage with
# 23-hour tours. Set to the median berangkat -> tiba_pangkalan in the Damkar
# log (281 min over 408 records). The model's clock never idles — every second
# is driving, pumping or draining — so it maps to a typical deployment rather
# than a long one: at the p90 of 517 min the fleet finished almost everything
# and the limit never bound.
ROUTE_HORIZON_S = 281 * 60.0

# A depot may only dispatch to a flood it can reach within this drive time. Set
# to the longest response time in the Damkar log (respon_time, 7 min over 409
# records, median 7). Without it the solvers sent crews across the city: half
# the pumping visits came from depots over 7 minutes away, up to 27 minutes.
# A flood no depot reaches in time falls back to its nearest depot, so it is
# never stranded; if even that crew cannot serve it, it carries over.
DISPATCH_LIMIT_S = 7 * 60.0

# Local search scans every pair of stops, and on a heavy scenario a route runs
# to a hundred stops, so a single pass eats the whole budget. Restricting each
# move to a node's k nearest neighbours is the standard VRP remedy: swaps
# between stops on opposite sides of the city are never the ones that help.
CANDIDATE_K = 12

# Cost per second a route runs past the horizon. A crew cannot simply work
# longer, so this is a big-M: it keeps the objective a single scalar while
# making overtime something the search never trades for. At 5000 a move that
# bought coverage still paid for a two-minute overrun.
HORIZON_PENALTY = 1e6

# Weight on severity-weighted pumping work left undone. Both terms of the
# objective are in severity-seconds, so this stays dimensionless. Calibrated on
# s2-jun: at 100 the solvers settled for 99.3% coverage that was achievable, at
# 500 they close it. Lower it deliberately to study the coverage/priority
# trade-off, not as a default.
UNSERVED_PENALTY = 500.0

SBY_LAT_MIN, SBY_LAT_MAX = -7.38, -7.13
SBY_LON_MIN, SBY_LON_MAX = 112.58, 112.87


@dataclass
class DepotFleet:
    """What one depot fields: tank sizes with unit counts, and how long a crew may stay out."""

    units: list[tuple[int, int]]       # (capacity_l, count)
    operating_s: float | None = None   # None: use the global route horizon


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

    # For each node, the nodes close enough to be worth a local-search move
    neighbor_sets: list[set[int]]

    # Matrices addressed on the full node space
    dist_matrix: np.ndarray        # (n_total, n_total) meters
    time_matrix: np.ndarray        # (n_total, n_total) seconds

    # Convenience index ranges
    depot_indices: list[int] = field(default_factory=list)
    flood_indices: list[int] = field(default_factory=list)
    if_indices: list[int] = field(default_factory=list)

    # Vehicles: each entry is (depot_node_index, capacity_liters)
    vehicles: list[tuple[int, int]] = field(default_factory=list)
    # How long each vehicle's crew may stay deployed, aligned with `vehicles`.
    # Empty means every vehicle uses `route_horizon_s`.
    vehicle_horizon_s: list[float] = field(default_factory=list)

    # Soft-constraint weight for unserved pumping work.
    unserved_penalty: float = UNSERVED_PENALTY

    # Seconds a single vehicle may stay deployed on one route, and the cost of
    # each second beyond it.
    route_horizon_s: float = ROUTE_HORIZON_S
    horizon_penalty: float = HORIZON_PENALTY

    # Dispatch constraint: depots allowed to serve each flood, by flood slot
    eligible_depots: list[frozenset[int]] = field(default_factory=list)
    # Quick lookup: depot_node_index -> set of flood node indices it may serve
    depot_flood_sets: dict[int, set[int]] = field(default_factory=dict)
    dispatch_limit_s: float = DISPATCH_LIMIT_S

    def horizon_of(self, vehicle: int) -> float:
        """Seconds the vehicle in slot `vehicle` may stay on its route."""
        if 0 <= vehicle < len(self.vehicle_horizon_s):
            return self.vehicle_horizon_s[vehicle]
        return self.route_horizon_s


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
    dispatch_limit_s: float = DISPATCH_LIMIT_S,
    fleet: dict[str, DepotFleet] | None = None,
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
    # `volume_l` is the pumping workload calibrated from the Damkar handling log
    # (see preprocessing/workload.py). The depth proxy is only a fallback for
    # scenarios built before that column existed.
    from_file = np.array(
        [float(f.get("volume_l") or np.nan) for f in floods], dtype=float
    ) if floods else np.array([], dtype=float)
    fallback = np.maximum(depths, 5.0) * volume_per_cm  # min 5cm to avoid zeros
    volumes = np.where(np.isfinite(from_file) & (from_file > 0), from_file, fallback)

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

    k = min(CANDIDATE_K, max(n_total - 1, 1))
    neighbor_sets = [
        set(int(j) for j in np.argsort(dist_matrix[i])[: k + 1] if int(j) != i)
        for i in range(n_total)
    ]

    # By default each depot fields one vehicle per capacity type. A fleet config
    # replaces that per depot: its own tank sizes, unit counts and shift length.
    vehicles: list[tuple[int, int]] = []
    vehicle_horizon_s: list[float] = []
    for di in depot_indices:
        entry = (fleet or {}).get(str(depots[di].get("id")))
        units = entry.units if entry else [(cap, 1) for cap in VEHICLE_CAPACITIES_L]
        shift = entry.operating_s if entry and entry.operating_s else route_horizon_s
        for cap, count in units:
            for _ in range(count):
                vehicles.append((di, int(cap)))
                vehicle_horizon_s.append(float(shift))

    # Dispatch constraint: a depot serves a flood only within the drive-time
    # limit, falling back to the nearest depot when none is in range.
    depot_arr = np.array(depot_indices, dtype=int)
    flood_arr = np.array(flood_indices, dtype=int)
    eligible_depots: list[frozenset[int]] = []
    depot_flood_sets: dict[int, set[int]] = {di: set() for di in depot_indices}
    if n_depots > 0 and n_floods > 0:
        drive = time_matrix[np.ix_(depot_arr, flood_arr)]
        for k, fi in enumerate(flood_indices):
            in_range = depot_arr[drive[:, k] <= dispatch_limit_s]
            chosen = in_range if len(in_range) else depot_arr[[int(np.argmin(drive[:, k]))]]
            eligible_depots.append(frozenset(int(d) for d in chosen))
            for d in chosen:
                depot_flood_sets[int(d)].add(fi)
    else:
        eligible_depots = [frozenset() for _ in range(n_floods)]

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
        neighbor_sets=neighbor_sets,
        dist_matrix=dist_matrix.astype(float),
        time_matrix=time_matrix.astype(float),
        depot_indices=depot_indices,
        flood_indices=flood_indices,
        if_indices=if_indices,
        vehicles=vehicles,
        vehicle_horizon_s=vehicle_horizon_s,
        unserved_penalty=float(unserved_penalty),
        route_horizon_s=float(route_horizon_s),
        horizon_penalty=float(horizon_penalty),
        eligible_depots=eligible_depots,
        depot_flood_sets=depot_flood_sets,
        dispatch_limit_s=float(dispatch_limit_s),
    )
