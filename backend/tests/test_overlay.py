"""Edits held by the browser and laid over the stored data (app.data.overlay).

On Vercel the server cannot keep edits, so the browser sends the edited datasets
with every run. These tests check that an edit sent that way is what the run
plans on, and that unedited data plans exactly as before.
"""

import numpy as np
import pytest

from app.data import canvas, overlay
from app.data.store import store
from app.preprocessing import enrich, matrix

SID = "s2-jun"
RUN = {"max_iterations": 3, "time_limit_s": 3, "seed": 1}


@pytest.fixture()
def offline(monkeypatch):
    """No network: fixed attributes, straight-line legs."""
    monkeypatch.setattr(enrich, "enrich_attrs", lambda lat, lon, **_: (2, 150.0))

    def vectors(lat, lon, lats, lons):
        d = np.hypot(np.asarray(lats) - lat, np.asarray(lons) - lon) * 111_000.0
        return d, d, d / 8.0, d / 8.0

    monkeypatch.setattr(enrich, "node_vectors", vectors)
    monkeypatch.setattr(matrix, "osrm_table", lambda *a, **k: (None, None))
    canvas.clear_caches()
    yield
    canvas.clear_caches()


def _rows(df):
    return [
        {k: (None if isinstance(v, float) and np.isnan(v) else v) for k, v in r.items()}
        for r in df.to_dict(orient="records")
    ]


def test_unedited_data_sent_back_plans_on_the_stored_matrix():
    b = store.get(SID)
    data = {
        "floods": _rows(b.floods),
        "depo": _rows(b.depots),
        "if": _rows(b.ifs),
        "faskes": _rows(b.faskes),
    }
    got = overlay.bundle_for_request(SID, data)
    assert np.array_equal(got.distance_matrix, b.distance_matrix)
    assert np.array_equal(got.time_matrix, b.time_matrix)


def test_a_moved_flood_point_gets_new_legs_and_the_rest_keep_theirs(offline):
    b = store.get(SID)
    floods = _rows(b.floods)
    floods[3] = {**floods[3], "lat": floods[3]["lat"] + 0.01}
    got = overlay.bundle_for_request(SID, {"floods": floods})
    n_d = len(b.depots)
    moved = n_d + 3
    keep = np.delete(np.arange(got.distance_matrix.shape[0]), moved)
    assert np.array_equal(
        got.distance_matrix[np.ix_(keep, keep)], b.distance_matrix[np.ix_(keep, keep)]
    )
    assert not np.allclose(got.distance_matrix[moved], b.distance_matrix[moved])
    assert got.distance_matrix[moved, moved] == 0.0


def test_a_deleted_flood_point_drops_out_of_the_matrix():
    b = store.get(SID)
    floods = _rows(b.floods)[1:]
    got = overlay.bundle_for_request(SID, {"floods": floods})
    n = len(b.depots) + len(floods) + len(b.ifs)
    assert got.distance_matrix.shape == (n, n)
    assert list(got.floods["id"]) == [f["id"] for f in floods]


def test_a_closed_down_outlet_and_a_new_depot(offline):
    b = store.get(SID)
    ifs = _rows(b.ifs)[:-1]
    new_depot = {"id": "D_999", "osm_id": 999, "lat": -7.28, "lon": 112.74, "name": "Pos baru"}
    depots = [*_rows(b.depots), new_depot]
    got = overlay.bundle_for_request(SID, {"depo": depots, "if": ifs})
    n = len(depots) + len(b.floods) + len(ifs)
    assert got.distance_matrix.shape == (n, n)
    new_at = len(depots) - 1
    assert np.all(got.distance_matrix[new_at, np.arange(n) != new_at] > 0)


def test_a_run_plans_on_the_edits_it_is_sent(client, offline):
    b = store.get(SID)
    floods = _rows(b.floods)[:5]
    r = client.post(f"/api/optimize/vns?scenario={SID}", json={**RUN, "data": {"floods": floods}})
    assert r.status_code == 200, r.text
    visited = {v["node_id"] for rt in r.json()["routes"] for v in rt["visits"] if v["node_type"] == "flood"}
    assert visited <= {f["id"] for f in floods}

    r = client.post(f"/api/severity-index?scenario={SID}", json={"data": {"floods": floods}})
    assert [p["id"] for p in r.json()["flood_points"]] == [f["id"] for f in floods]


def test_rows_are_checked_without_being_stored(client):
    before = len(client.get("/api/data/depo").json())
    r = client.post("/api/data/depo/check", json={"osm_id": 5, "lat": -7.27, "lon": 112.75})
    assert r.status_code == 200 and r.json()["id"] == "D_5"
    assert client.post("/api/data/if/check", json={"lat": -1.0, "lon": 112.75}).status_code == 422
    assert len(client.get("/api/data/depo").json()) == before


def test_duplicate_ids_are_refused(client):
    b = store.get(SID)
    depots = _rows(b.depots)
    r = client.post(
        f"/api/optimize/vns?scenario={SID}", json={**RUN, "data": {"depo": [*depots, depots[0]]}}
    )
    assert r.status_code == 422
