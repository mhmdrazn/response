"""The blank canvas: a scenario that starts with no flood points.

Next to the study areas (real flood events) the user can open an empty map, place
flood points by hand and plan routes for them. It is an ordinary scenario on disk
(floods.csv + matrices), so adding, editing and deleting points goes through the
same path as any other scenario (scenario_edit splices each point into the
matrices). Its files are not shipped: they are created on first use and on reset.

Depots and outlets are shared by every scenario, so the canvas's starting matrices
(depots and outlets only) are cut out of a study area's matrices; no routing calls.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from app.config import readable_path, scenario_floods_path, scenario_matrix_paths, writable_path
from app.data import registry

_log = logging.getLogger("response.data")

CANVAS_ID = "kanvas"
FLOOD_COLUMNS = ["datetime", "lat", "lon", "ketinggian_cm", "road_class", "dist_faskes_m", "volume_l"]


def is_canvas(scenario_id: str) -> bool:
    return scenario_id == CANVAS_ID


def _base_matrices() -> tuple[np.ndarray, np.ndarray] | None:
    """Distance and time between depots and outlets only, from a study area's matrices."""
    from app.data.store import store  # store imports this module

    for sid in registry.scenario_ids():
        if is_canvas(sid):
            continue
        b = store.get(sid)
        if b.distance_matrix is None or b.time_matrix is None:
            continue
        n_d, n_f = len(b.depots), len(b.floods)
        keep = np.r_[0:n_d, n_d + n_f : b.distance_matrix.shape[0]]
        cut = np.ix_(keep, keep)
        return b.distance_matrix[cut].copy(), b.time_matrix[cut].copy()
    return None


def _write_empty() -> None:
    floods_path = writable_path(scenario_floods_path(CANVAS_ID))
    floods_path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(columns=FLOOD_COLUMNS).to_csv(floods_path, index=False)
    dpath, tpath = scenario_matrix_paths(CANVAS_ID)
    base = _base_matrices()
    if base is None:
        # No study area has matrices: the canvas falls back to straight-line times.
        _log.warning("canvas: no base matrices found; using Manhattan distances")
        for p in (dpath, tpath):
            readable_path(p).unlink(missing_ok=True)
            writable_path(p).unlink(missing_ok=True)
        return
    np.save(writable_path(dpath), base[0])
    np.save(writable_path(tpath), base[1])


def ensure() -> None:
    """Creates the canvas's files the first time it is opened."""
    if not readable_path(scenario_floods_path(CANVAS_ID)).exists():
        _write_empty()


def reset() -> None:
    """Back to an empty map: every hand-placed point is removed."""
    from app.data.store import store

    _write_empty()
    store.invalidate(CANVAS_ID)
