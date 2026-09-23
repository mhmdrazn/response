"""ScenarioStore: load and cache a scenario's data bundle.

Replaces the old mutable module globals. Shared datasets (depo/if/faskes) are
loaded once and reused; per-scenario floods + matrices are cached per id and
dropped on invalidate (after a CRUD write or reload).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
import pandas as pd

from app.config import SHARED_FILES, scenario_floods_path, scenario_matrix_paths
from app.data import loaders, registry

_log = logging.getLogger("response.data")


@dataclass
class Bundle:
    scenario_id: str
    floods: pd.DataFrame
    depots: pd.DataFrame
    ifs: pd.DataFrame
    faskes: pd.DataFrame
    distance_matrix: np.ndarray | None
    time_matrix: np.ndarray | None


class ScenarioStore:
    def __init__(self) -> None:
        self._bundles: dict[str, Bundle] = {}
        self._shared: tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame] | None = None

    def _shared_data(self) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        if self._shared is None:
            self._shared = (
                loaders.load_depots(SHARED_FILES["depo"]),
                loaders.load_ifs(SHARED_FILES["if"]),
                loaders.load_faskes(SHARED_FILES["faskes"]),
            )
        return self._shared

    def get(self, scenario_id: str | None = None) -> Bundle:
        sid = registry.resolve(scenario_id)
        cached = self._bundles.get(sid)
        if cached is not None:
            return cached

        depots, ifs, faskes = self._shared_data()
        floods = loaders.load_floods(scenario_floods_path(sid))
        n_expected = len(depots) + len(floods) + len(ifs)
        dist, time = self._load_matrices(sid, n_expected)

        bundle = Bundle(sid, floods, depots, ifs, faskes, dist, time)
        self._bundles[sid] = bundle
        return bundle

    def _load_matrices(
        self, sid: str, n_expected: int
    ) -> tuple[np.ndarray | None, np.ndarray | None]:
        dpath, tpath = scenario_matrix_paths(sid)
        if not dpath.exists() or not tpath.exists():
            return None, None
        dist = np.load(dpath)
        time = np.load(tpath)
        if dist.shape[0] != n_expected:
            _log.warning(
                "scenario %s: matrix %s != expected (%d). Falling back to Manhattan.",
                sid, dist.shape, n_expected,
            )
            return None, None
        return dist, time

    def invalidate(self, scenario_id: str | None = None) -> None:
        if scenario_id is None:
            self._bundles.clear()
            return
        try:
            self._bundles.pop(registry.resolve(scenario_id), None)
        except KeyError:
            self._bundles.pop(scenario_id, None)

    def invalidate_shared(self) -> None:
        # A shared node (depo/if/faskes) changed -> every scenario's matrix and
        # cached bundle is now stale.
        self._shared = None
        self._bundles.clear()


store = ScenarioStore()
