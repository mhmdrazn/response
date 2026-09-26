"""Derive per-point pumping workload from the Damkar handling log.

The recorded on-scene span covers pumping *and* the repeated drives to an IF
and back. The optimiser models those trips itself, so only the pumping share
may become demand, or the shuttle is counted twice:

    T_on_scene = setup + T_pump + (Q * T_pump / C) * cycle
    T_pump     = (T_on_scene - setup) / (1 + Q * cycle / C)
    volume     = Q * T_pump

A point's own `selesai` is not available when its route is being planned, so it
is never used for its own demand. Instead the log is calibrated once into a
depth-class -> median duration table, and a point draws the expected duration
for its depth. Days belonging to the scenario being built are held out, which
keeps the calibration out of sample.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

from app.algorithms.instance import (
    IF_DRAIN_FACTOR,
    IF_DRAIN_S,
    PUMP_RATE_LPS,
    SERVICE_SETUP_S,
    VEHICLE_CAPACITIES_L,
)
from app.config import GEOCODED_MASTER

# Depth classes in cm. Median handling time rises monotonically across these,
# though depth explains little of the variance (r = 0.18) — hence classes
# rather than a regression.
DEPTH_EDGES = [0.0, 10.0, 20.0, 30.0, 50.0, np.inf]

# Used when the log yields nothing for a class (or at all): the pooled median
# on-scene span, 268 min over 408 records.
FALLBACK_ON_SCENE_S = 268 * 60.0

# Median IF round trip measured on s2-jun, for intake when no travel matrix is
# available to measure the point's own.
FALLBACK_CYCLE_S = 366.0


def _on_scene_seconds(df: pd.DataFrame) -> pd.Series:
    start = pd.to_datetime(df.get("mulai_penanganan"), errors="coerce", utc=True)
    end = pd.to_datetime(df.get("selesai"), errors="coerce", utc=True)
    secs = (end - start).dt.total_seconds()
    return secs.where((secs > 0) & (secs < 48 * 3600))


def calibrate_on_scene(
    master: Path = GEOCODED_MASTER,
    exclude_dates: set[str] | None = None,
) -> list[float]:
    """Median on-scene seconds per depth class, holding out the given dates."""
    df = pd.read_csv(master)
    if exclude_dates:
        keep = ~pd.to_datetime(df["tanggal"], errors="coerce").dt.strftime(
            "%Y-%m-%d"
        ).isin(exclude_dates)
        df = df[keep]

    secs = _on_scene_seconds(df)
    depth = pd.to_numeric(df.get("depth_cm"), errors="coerce")
    classes = pd.cut(depth, DEPTH_EDGES, labels=False, include_lowest=True)

    pooled = float(secs.median()) if secs.notna().any() else FALLBACK_ON_SCENE_S
    out: list[float] = []
    for k in range(len(DEPTH_EDGES) - 1):
        sel = secs[classes == k].dropna()
        out.append(float(sel.median()) if len(sel) >= 5 else pooled)
    return out


@lru_cache(maxsize=1)
def default_table() -> tuple[float, ...]:
    """Calibration over the whole log, for intake where no scenario is held out."""
    try:
        return tuple(calibrate_on_scene())
    except Exception:  # noqa: BLE001 — master log missing or unreadable
        return tuple([FALLBACK_ON_SCENE_S] * (len(DEPTH_EDGES) - 1))


def expected_on_scene_s(depth_cm: float | None, table: list[float]) -> float:
    if depth_cm is None or not np.isfinite(depth_cm):
        return FALLBACK_ON_SCENE_S
    k = int(np.clip(np.searchsorted(DEPTH_EDGES, depth_cm, side="left") - 1,
                    0, len(table) - 1))
    return table[k]


def if_cycle_seconds(
    time_to_ifs: np.ndarray,
    if_waterway_types: list[str],
) -> float:
    """Round trip to the quickest IF outlet: drive there, drain, drive back."""
    drains = np.array(
        [IF_DRAIN_S * IF_DRAIN_FACTOR.get(str(t or ""), 1.0) for t in if_waterway_types],
        dtype=float,
    )
    return float(np.min(2.0 * np.asarray(time_to_ifs, dtype=float) + drains))


def pumping_seconds(on_scene_s: float, cycle_s: float, capacity_l: float) -> float:
    usable = max(0.0, on_scene_s - SERVICE_SETUP_S)
    return usable / (1.0 + PUMP_RATE_LPS * cycle_s / capacity_l)


def volume_liters(on_scene_s: float, cycle_s: float, capacity_l: float | None = None) -> float:
    cap = capacity_l if capacity_l else float(np.mean(VEHICLE_CAPACITIES_L))
    return PUMP_RATE_LPS * pumping_seconds(on_scene_s, cycle_s, cap)


def volumes_for_points(
    depths_cm: np.ndarray,
    time_flood_to_if: np.ndarray,
    if_waterway_types: list[str],
    table: list[float],
) -> np.ndarray:
    """Workload in litres for each flood point.

    `time_flood_to_if` is the (n_floods, n_ifs) block of the travel-time matrix.
    """
    cap = float(np.mean(VEHICLE_CAPACITIES_L))
    return np.array(
        [
            volume_liters(
                expected_on_scene_s(float(d) if np.isfinite(d) else None, table),
                if_cycle_seconds(time_flood_to_if[i], if_waterway_types),
                cap,
            )
            for i, d in enumerate(np.asarray(depths_cm, dtype=float))
        ],
        dtype=float,
    )
