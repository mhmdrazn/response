"""The blank canvas: a scenario that starts with no flood points.

Next to the study areas (real flood events) the user can open an empty map, place
flood points by hand and plan routes for them.

The points live in the browser, not on the server. A serverless deployment
(Vercel) runs many short-lived instances, each with its own /tmp, so points saved
to disk by one request were missing for the next one and the canvas looked
emptied. So the browser holds the points and sends them with every request that
needs them; `bundle_for` builds the scenario from them on the spot. A point is
enriched (road class, clinic distance, workload) by `enrich_point` without being
stored.

Depots and outlets are shared by every scenario, so the canvas's matrices start
from a study area's (depots and outlets only, no routing calls); only the legs to
and between the hand-placed points are asked of OSRM, and remembered per point.
"""

from __future__ import annotations

import hashlib
import logging
import threading
from collections import OrderedDict
from typing import Any

import numpy as np
import pandas as pd
from fastapi import HTTPException

from app.config import readable_path, scenario_floods_path, scenario_matrix_paths, writable_path
from app.data import registry

_log = logging.getLogger("response.data")

CANVAS_ID = "kanvas"
FLOOD_COLUMNS = ["datetime", "lat", "lon", "ketinggian_cm", "road_class", "dist_faskes_m", "volume_l"]
# Columns a hand-placed point carries; anything else sent along is dropped.
POINT_COLUMNS = ["id", *FLOOD_COLUMNS, "deskripsi"]


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


# --- Points held by the browser --------------------------------------------

_lock = threading.Lock()
_base_cache: tuple[np.ndarray, np.ndarray] | None = None
# Legs between one hand-placed point and the depots + outlets, per point; the
# same points come back with every request, so OSRM is asked once per point.
_VECTOR_CACHE: OrderedDict[tuple[float, float, str], tuple[np.ndarray, ...]] = OrderedDict()
_VECTOR_CACHE_SIZE = 512
# Legs between the points themselves, per set of points.
_PAIR_CACHE: OrderedDict[str, tuple[np.ndarray, np.ndarray]] = OrderedDict()
_PAIR_CACHE_SIZE = 32


def _remember(cache: OrderedDict, key: Any, value: Any, size: int) -> None:
    with _lock:
        cache[key] = value
        cache.move_to_end(key)
        while len(cache) > size:
            cache.popitem(last=False)


def _recall(cache: OrderedDict, key: Any) -> Any:
    with _lock:
        value = cache.get(key)
        if value is not None:
            cache.move_to_end(key)
        return value


def _base() -> tuple[np.ndarray, np.ndarray] | None:
    global _base_cache
    if _base_cache is None:
        _base_cache = _base_matrices()
    return _base_cache


def clear_caches() -> None:
    """Forget the cached legs (the shared depots or outlets changed)."""
    global _base_cache
    with _lock:
        _base_cache = None
        _VECTOR_CACHE.clear()
        _PAIR_CACHE.clear()


def points_key(points: list[dict[str, Any]]) -> str:
    """A short fingerprint of where the points are, for caches keyed on the node set."""
    coords = ";".join(f"{float(p['lat']):.6f},{float(p['lon']):.6f}" for p in points)
    return hashlib.sha1(coords.encode()).hexdigest()[:12]


def floods_frame(points: list[dict[str, Any]]) -> pd.DataFrame:
    """The points as the floods table a scenario on disk would load into."""
    df = pd.DataFrame([{k: p.get(k) for k in POINT_COLUMNS} for p in points], columns=POINT_COLUMNS)
    for col in ("ketinggian_cm", "road_class", "dist_faskes_m", "volume_l", "lat", "lon"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["id"] = df["id"].astype(str)
    if df["id"].duplicated().any():
        raise HTTPException(status_code=422, detail="id titik genangan harus unik.")
    return df


def fixed_key(lats: np.ndarray, lons: np.ndarray) -> str:
    """Names a set of depots and outlets, so legs measured on another set are not reused."""
    return f"{len(lats)}-" + points_key([{"lat": a, "lon": b} for a, b in zip(lats, lons)])


def shared_nodes(depots: pd.DataFrame, ifs: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, str]:
    """Coordinates of the depots then the outlets, and the key naming that set."""
    lats = np.concatenate([depots["lat"], ifs["lat"]]).astype(float)
    lons = np.concatenate([depots["lon"], ifs["lon"]]).astype(float)
    return lats, lons, fixed_key(lats, lons)


def sent_legs(point: dict[str, Any], key: str, n: int) -> tuple[np.ndarray, ...] | None:
    """The legs the browser sent with a point, if they were measured on this node set."""
    legs = point.get("legs")
    if not legs or legs.get("key") != key:
        return None
    parts = tuple(np.asarray(legs[k], dtype=float) for k in ("to_m", "from_m", "to_s", "from_s"))
    return parts if all(len(p) == n for p in parts) else None


def legs_out(parts: tuple[np.ndarray, ...], key: str) -> dict[str, Any]:
    return {
        "key": key,
        **{k: [round(float(x), 1) for x in v] for k, v in zip(("to_m", "from_m", "to_s", "from_s"), parts)},
    }


def vectors(
    lat: float, lon: float, other_lats: np.ndarray, other_lons: np.ndarray
) -> tuple[np.ndarray, ...]:
    """Legs from and to one node, remembered per node and per set of other nodes."""
    from app.preprocessing import enrich

    key = (round(lat, 6), round(lon, 6), points_key(
        [{"lat": a, "lon": b} for a, b in zip(other_lats, other_lons)]
    ))
    hit = _recall(_VECTOR_CACHE, key)
    if hit is None:
        hit = enrich.node_vectors(lat, lon, other_lats, other_lons)
        _remember(_VECTOR_CACHE, key, hit, _VECTOR_CACHE_SIZE)
    return hit


def pairwise(lats: np.ndarray, lons: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Distance and time between the points themselves (OSRM, Manhattan where missing)."""
    from app.preprocessing import enrich

    n = len(lats)
    dist, tmat = np.zeros((n, n)), np.zeros((n, n))
    if n < 2:
        return dist, tmat
    key = points_key([{"lat": a, "lon": b} for a, b in zip(lats, lons)])
    hit = _recall(_PAIR_CACHE, key)
    if hit is not None:
        return hit
    if n <= enrich.OSRM_TABLE_MAX_COORDS:
        # Every point against every other in one table request.
        from app.preprocessing import matrix

        coords = ";".join(f"{lo:.6f},{la:.6f}" for la, lo in zip(lats, lons))
        ds, du = matrix.osrm_table(coords, list(range(n)), list(range(n)), retries=2)
        if ds is not None:
            dist = np.array(ds, dtype=float)
            tmat = np.array(du, dtype=float)
        man = matrix.manhattan(np.asarray(lats, dtype=float), np.asarray(lons, dtype=float))
        dist = np.where(np.isnan(dist) if ds is not None else True, man, dist)
        tmat = np.where(np.isnan(tmat) if du is not None else True, man / (30_000 / 3600), tmat)
        np.fill_diagonal(dist, 0.0)
        np.fill_diagonal(tmat, 0.0)
    else:
        for i in range(n - 1):
            # Point i against every later point: row = i -> j, col = j -> i.
            rd, cd, rt, ct = enrich.node_vectors(
                float(lats[i]), float(lons[i]), lats[i + 1 :], lons[i + 1 :]
            )
            dist[i, i + 1 :], dist[i + 1 :, i] = rd, cd
            tmat[i, i + 1 :], tmat[i + 1 :, i] = rt, ct
    _remember(_PAIR_CACHE, key, (dist, tmat), _PAIR_CACHE_SIZE)
    return dist, tmat


def base_bundle():
    """The canvas with no points: depots, outlets and their legs, no routing calls."""
    from app.data.store import Bundle, store

    depots, ifs, faskes = store.shared()
    floods = floods_frame([])
    base = _base()
    if base is None or base[0].shape[0] != len(depots) + len(ifs):
        # Without the depot/outlet legs the solvers fall back to Manhattan.
        return Bundle(CANVAS_ID, floods, depots, ifs, faskes, None, None)
    return Bundle(CANVAS_ID, floods, depots, ifs, faskes, base[0], base[1])


def bundle_for(points: list[dict[str, Any]]):
    """The canvas as a scenario bundle, built from the points the browser holds."""
    from app.data import overlay

    return overlay.assemble(base_bundle(), floods=points)


def enrich_point(
    payload: dict[str, Any],
    others: list[dict[str, Any]],
    *,
    depots: pd.DataFrame | None = None,
    ifs: pd.DataFrame | None = None,
    faskes: pd.DataFrame | None = None,
) -> dict[str, Any]:
    """A new or edited flood point with its road class, clinic distance and workload filled.

    Nothing is stored. `others` are the scenario's other points, to refuse one
    dropped on top of an existing puddle. Depots, outlets and clinics default to
    the server's; the browser sends its own when it has edited them.
    """
    from app.data import scenario_edit
    from app.data.store import store
    from app.preprocessing import enrich

    shared_d, shared_i, shared_f = store.shared()
    depots = shared_d if depots is None else depots
    ifs = shared_i if ifs is None else ifs
    faskes = shared_f if faskes is None else faskes

    row = {k: v for k, v in payload.items() if v is not None}
    lat, lon = float(row["lat"]), float(row["lon"])
    if others:
        scenario_edit.reject_duplicate(floods_frame(others), lat, lon)
    rc, dfk = enrich.enrich_attrs(lat, lon, faskes_df=faskes)
    row["road_class"], row["dist_faskes_m"] = rc, dfk
    if row.get("volume_l") is None:
        row["volume_l"] = scenario_edit.workload_l(row.get("ketinggian_cm"), rc)
    lats, lons, key = shared_nodes(depots, ifs)
    row["legs"] = legs_out(vectors(lat, lon, lats, lons), key)
    return row
