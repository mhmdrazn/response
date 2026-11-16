"""Edits held by the browser, laid over the data on the server for one request.

A serverless deployment (Vercel) cannot keep edits: each request may run on a
different short-lived instance, each with its own /tmp. So the browser keeps
every edit (hand-placed canvas points, edited flood points of a study area, and
edited depots, outlets and clinics) and sends the edited datasets with each
request that computes something. Here they replace the stored ones, and the
travel matrices are rebuilt to match:

- a node that is unchanged (same id, same place) keeps its legs from the stored
  matrix, so an unedited study area plans exactly as before;
- a new or moved flood point brings the legs to the depots and outlets the
  server measured when it was placed (`legs`), or has them measured now;
- a new or moved depot or outlet has its legs to every node measured now;
- legs between flood points involving a new one come from one OSRM table.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from fastapi import HTTPException

from app.data import canvas, registry
from app.data.store import Bundle, store

_COLUMNS: dict[str, list[str]] = {
    "depo": ["id", "osm_id", "lat", "lon", "name", "address", "type"],
    "if": [
        "id", "lat", "lon", "waterway_name", "waterway_type", "highway_name",
        "highway_type", "distance_to_water_m", "n_source_points",
    ],
    "faskes": ["id", "osm_id", "lat", "lon", "name", "amenity", "street", "healthcare", "type"],
}
_LABEL = {"depo": "depo", "if": "titik buang", "faskes": "faskes"}


def shared_frame(name: str, rows: list[dict[str, Any]]) -> pd.DataFrame:
    """Edited depots, outlets or clinics as the table the server would have loaded."""
    cols = _COLUMNS[name]
    df = pd.DataFrame([{k: r.get(k) for k in cols} for r in rows], columns=cols)
    df["lat"] = pd.to_numeric(df["lat"], errors="coerce")
    df["lon"] = pd.to_numeric(df["lon"], errors="coerce")
    df["id"] = df["id"].astype(str)
    if df["id"].duplicated().any():
        raise HTTPException(status_code=422, detail=f"id {_LABEL[name]} harus unik.")
    return df


def _node_keys(depots: pd.DataFrame, floods: pd.DataFrame, ifs: pd.DataFrame) -> list[tuple]:
    """Each node in matrix order, named by kind, id and place."""
    out: list[tuple] = []
    for kind, df in (("d", depots), ("f", floods), ("i", ifs)):
        for i, la, lo in zip(df["id"], df["lat"], df["lon"]):
            out.append((kind, str(i), round(float(la), 6), round(float(lo), 6)))
    return out


def assemble(
    base: Bundle,
    *,
    depots: list[dict[str, Any]] | None = None,
    floods: list[dict[str, Any]] | None = None,
    ifs: list[dict[str, Any]] | None = None,
    faskes: list[dict[str, Any]] | None = None,
) -> Bundle:
    """`base` with the given datasets in place of its own, and matrices to match."""
    if depots is None and floods is None and ifs is None and faskes is None:
        return base
    d_df = base.depots if depots is None else shared_frame("depo", depots)
    i_df = base.ifs if ifs is None else shared_frame("if", ifs)
    k_df = base.faskes if faskes is None else shared_frame("faskes", faskes)
    f_df = base.floods if floods is None else canvas.floods_frame(floods)
    points = floods if floods is not None else [{} for _ in range(len(f_df))]

    def bundle(dist: np.ndarray | None, tmat: np.ndarray | None) -> Bundle:
        return Bundle(base.scenario_id, f_df, d_df, i_df, k_df, dist, tmat)

    if base.distance_matrix is None or base.time_matrix is None:
        return bundle(None, None)  # the solvers fall back to Manhattan

    old = {k: i for i, k in enumerate(_node_keys(base.depots, base.floods, base.ifs))}
    new = _node_keys(d_df, f_df, i_df)
    n, n_d, n_f = len(new), len(d_df), len(f_df)
    src = np.array([old.get(k, -1) for k in new], dtype=int)
    dist, tmat = np.zeros((n, n)), np.zeros((n, n))
    known = np.flatnonzero(src >= 0)
    dist[np.ix_(known, known)] = base.distance_matrix[np.ix_(src[known], src[known])]
    tmat[np.ix_(known, known)] = base.time_matrix[np.ix_(src[known], src[known])]
    unknown = np.flatnonzero(src < 0)
    if len(unknown) == 0:
        return bundle(dist, tmat)

    lats = np.array([k[2] for k in new], dtype=float)
    lons = np.array([k[3] for k in new], dtype=float)
    floods_at = np.arange(n_d, n_d + n_f)
    fixed = np.r_[0:n_d, n_d + n_f : n]  # depots, then outlets

    # A new or moved depot or outlet: legs to every other node.
    for u in unknown:
        if n_d <= u < n_d + n_f:
            continue
        others = np.delete(np.arange(n), u)
        rd, cd, rt, ct = canvas.vectors(lats[u], lons[u], lats[others], lons[others])
        dist[u, others], dist[others, u] = rd, cd
        tmat[u, others], tmat[others, u] = rt, ct

    # A new or moved flood point: legs to the depots and outlets.
    key = canvas.fixed_key(lats[fixed], lons[fixed])
    new_floods = [u for u in unknown if n_d <= u < n_d + n_f]
    for u in new_floods:
        legs = canvas.sent_legs(points[u - n_d], key, len(fixed)) or canvas.vectors(
            lats[u], lons[u], lats[fixed], lons[fixed]
        )
        rd, cd, rt, ct = legs
        dist[u, fixed], dist[fixed, u] = rd, cd
        tmat[u, fixed], tmat[fixed, u] = rt, ct

    # Legs between flood points, where one of the two is new.
    if new_floods and n_f > 1:
        pair_d, pair_t = canvas.pairwise(lats[floods_at], lons[floods_at])
        for u in new_floods:
            j = u - n_d
            dist[u, floods_at], dist[floods_at, u] = pair_d[j], pair_d[:, j]
            tmat[u, floods_at], tmat[floods_at, u] = pair_t[j], pair_t[:, j]

    np.fill_diagonal(dist, 0.0)
    np.fill_diagonal(tmat, 0.0)
    return bundle(dist, tmat)


def bundle_for_request(scenario_id: str | None, data: dict[str, Any] | None = None) -> Bundle:
    """The bundle a request works on: the stored scenario with the browser's edits over it.

    The canvas has no points on the server: they all come from the browser.
    Raises KeyError for an unknown scenario.
    """
    sid = registry.resolve(scenario_id)
    data = data or {}
    on_canvas = canvas.is_canvas(sid)
    base = canvas.base_bundle() if on_canvas else store.get(sid)
    floods = data.get("floods")
    if on_canvas and floods is None:
        floods = []
    return assemble(
        base,
        depots=data.get("depo"),
        floods=floods,
        ifs=data.get("if"),
        faskes=data.get("faskes"),
    )
