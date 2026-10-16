"""The blank canvas scenario: starts empty, takes hand-placed points, can be reset."""

import numpy as np
import pytest

from app import config
from app.data import canvas
from app.data.store import store
from app.preprocessing import enrich

RUN = {"max_iterations": 3, "time_limit_s": 3, "seed": 1}


@pytest.fixture()
def blank(tmp_path, monkeypatch):
    """The canvas in a temporary folder, so tests never touch the real one."""
    monkeypatch.setattr(config, "WRITABLE_ROOT", tmp_path)
    store.invalidate(canvas.CANVAS_ID)
    canvas.reset()
    yield
    store.invalidate(canvas.CANVAS_ID)


def _offline_enrich(monkeypatch):
    """New points without network calls: fixed attributes, straight-line legs."""
    monkeypatch.setattr(enrich, "enrich_attrs", lambda lat, lon, **_: (2, 150.0))

    def vectors(lat, lon, lats, lons):
        d = np.hypot(lats - lat, lons - lon) * 111_000.0
        return d, d, d / 8.0, d / 8.0

    monkeypatch.setattr(enrich, "node_vectors", vectors)


def test_canvas_is_listed_next_to_the_study_areas(client):
    body = client.get("/api/scenarios").json()
    kinds = {s["id"]: s["kind"] for s in body["scenarios"]}
    assert kinds["kanvas"] == "canvas"
    assert all(kinds[s] == "study" for s in ("s1-jan", "s2-jun", "s3-nov"))
    assert body["default"] == "s2-jun"


def test_canvas_starts_empty_with_depot_and_outlet_matrices(client, blank):
    b = store.get(canvas.CANVAS_ID)
    assert len(b.floods) == 0
    n = len(b.depots) + len(b.ifs)
    assert b.distance_matrix is not None and b.distance_matrix.shape == (n, n)
    assert client.get("/api/data/floods?scenario=kanvas").json() == []


def test_run_on_an_empty_canvas_asks_for_points(client, blank):
    r = client.post("/api/optimize/vns?scenario=kanvas", json=RUN)
    assert r.status_code == 422
    assert "titik genangan" in r.json()["detail"]


def test_points_placed_by_hand_get_routes_and_reset_clears_them(client, blank, monkeypatch):
    _offline_enrich(monkeypatch)
    for lat, lon, depth in [(-7.2650, 112.7378, 30), (-7.2900, 112.7500, 20)]:
        r = client.post(
            "/api/data/floods?scenario=kanvas",
            json={"lat": lat, "lon": lon, "ketinggian_cm": depth},
        )
        assert r.status_code in (200, 201), r.text

    b = store.get(canvas.CANVAS_ID)
    assert len(b.floods) == 2
    n = len(b.depots) + 2 + len(b.ifs)
    assert b.distance_matrix.shape == (n, n)

    r = client.post("/api/optimize/vns?scenario=kanvas", json=RUN)
    assert r.status_code == 200, r.text
    visited = {v["node_id"] for rt in r.json()["routes"] for v in rt["visits"]}
    assert {"F_0000", "F_0001"} & visited

    assert client.post("/api/scenarios/kanvas/reset").status_code == 204
    assert client.get("/api/data/floods?scenario=kanvas").json() == []
    # The study areas are never touched.
    assert len(client.get("/api/data/floods?scenario=s2-jun").json()) == 34


def test_study_areas_cannot_be_reset(client):
    assert client.post("/api/scenarios/s2-jun/reset").status_code == 403
