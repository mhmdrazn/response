# SI = AHP + Entropy Weight over depth_cm (benefit) + dist_faskes_m (cost)
# Depth ~3x more important than faskes accessibility (PAIRWISE ratio)

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
import pandas as pd

from app.algorithms.geo import haversine_matrix
from app.severity.ahp import ahp_weights, consistency_ratio
from app.severity.entropy import entropy_weights

CRITERIA = ["depth_cm", "dist_faskes_m"]

# Row/col order matches CRITERIA. Depth ≻ dist_faskes with ratio 3:1.
PAIRWISE = np.array(
    [
        [1.0, 3.0],
        [1.0 / 3.0, 1.0],
    ]
)


@dataclass
class SeverityResult:

    weights_ahp: np.ndarray
    weights_ew: np.ndarray
    weights_combined: np.ndarray
    si_values: np.ndarray                 # length = len(floods)
    per_point: list[dict[str, float | str]]  # id, si_value, depth, dist_faskes
    consistency_ratio: float


def _normalize_benefit(col: np.ndarray) -> np.ndarray:
    span = col.max() - col.min()
    if span == 0:
        return np.zeros_like(col)
    return (col - col.min()) / span


def _normalize_cost(col: np.ndarray) -> np.ndarray:
    span = col.max() - col.min()
    if span == 0:
        return np.zeros_like(col)
    return (col.max() - col) / span


def _distance_to_nearest_faskes(
    floods: pd.DataFrame, faskes: pd.DataFrame
) -> np.ndarray:
    if len(faskes) == 0:
        return np.full(len(floods), 1000.0)
    lats = np.concatenate(
        [floods["lat"].to_numpy(dtype=float), faskes["lat"].to_numpy(dtype=float)]
    )
    lons = np.concatenate(
        [floods["lon"].to_numpy(dtype=float), faskes["lon"].to_numpy(dtype=float)]
    )
    m = haversine_matrix(lats, lons)
    n_floods = len(floods)
    sub = m[:n_floods, n_floods:]
    return sub.min(axis=1)


def compute_severity_index(
    floods: pd.DataFrame,
    faskes: pd.DataFrame,
    combine: Literal["average", "geometric"] = "average",
) -> SeverityResult:
    if len(floods) == 0:
        return SeverityResult(
            weights_ahp=np.array([]),
            weights_ew=np.array([]),
            weights_combined=np.array([]),
            si_values=np.array([]),
            per_point=[],
            consistency_ratio=0.0,
        )

    depths = floods["ketinggian_cm"].to_numpy(dtype=float)
    depths = np.where(np.isnan(depths), np.nanmedian(depths[~np.isnan(depths)]) if np.any(~np.isnan(depths)) else 20.0, depths)
    dist_faskes = _distance_to_nearest_faskes(floods, faskes)

    norm_depth = _normalize_benefit(depths)
    norm_dist = _normalize_cost(dist_faskes)
    decision_matrix = np.column_stack([norm_depth, norm_dist])

    w_ahp = ahp_weights(PAIRWISE)
    # Entropy needs positive values; shift off zero
    w_ew = entropy_weights(decision_matrix + 1e-9)

    if combine == "geometric":
        combined = np.sqrt(w_ahp * w_ew)
        combined = combined / combined.sum()
    else:
        combined = (w_ahp + w_ew) / 2.0

    si = decision_matrix @ combined
    si = np.clip(si, 0.0, 1.0)

    per_point: list[dict[str, float | str]] = []
    ids = floods["id"].tolist()
    for i, node_id in enumerate(ids):
        per_point.append(
            {
                "id": str(node_id),
                "si_value": float(si[i]),
                "depth_cm": float(depths[i]),
                "dist_faskes_m": float(dist_faskes[i]),
            }
        )

    return SeverityResult(
        weights_ahp=w_ahp,
        weights_ew=w_ew,
        weights_combined=combined,
        si_values=si,
        per_point=per_point,
        consistency_ratio=consistency_ratio(PAIRWISE),
    )
