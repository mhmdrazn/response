"""The blank canvas scenario: starts empty, takes hand-placed points, can be reset."""

import numpy as np
import pytest

from app import config
from app.data import canvas
from app.data.store import store
from app.preprocessing import enrich, matrix

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
    # Legs between the points: none from OSRM, so they fall back to Manhattan.
    monkeypatch.setattr(matrix, "osrm_table", lambda *a, **k: (None, None))
    canvas.clear_caches()


def _place(client, points, lat, lon, depth=30):
    """Place a point the way the browser does: enrich it, then keep it with an id."""
    r = client.post(
        "/api/data/floods/enrich",
        json={"point": {"lat": lat, "lon": lon, "ketinggian_cm": depth}, "others": points},
    )
    assert r.status_code == 200, r.text
    return [*points, {**r.json(), "id": f"K_{len(points) + 1:03d}"}]


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


def test_points_placed_by_hand_get_routes(client, blank, monkeypatch):
    _offline_enrich(monkeypatch)
    points: list[dict] = []
    for lat, lon, depth in [(-7.2650, 112.7378, 30), (-7.2900, 112.7500, 20)]:
        points = _place(client, points, lat, lon, depth)
    assert all(p["road_class"] == 2 and p["volume_l"] > 0 for p in points)
    assert points[0]["legs"]["key"] and len(points[0]["legs"]["to_m"]) > 0

    # Nothing is kept on the server: the canvas on disk stays empty.
    assert client.get("/api/data/floods?scenario=kanvas").json() == []

    r = client.post("/api/optimize/vns?scenario=kanvas", json={**RUN, "data": {"floods": points}})
    assert r.status_code == 200, r.text
    visited = {v["node_id"] for rt in r.json()["routes"] for v in rt["visits"]}
    assert {"K_001", "K_002"} & visited

    r = client.post("/api/severity-index?scenario=kanvas", json={"data": {"floods": points}})
    assert [p["id"] for p in r.json()["flood_points"]] == ["K_001", "K_002"]
    # The study areas are never touched.
    assert len(client.get("/api/data/floods?scenario=s2-jun").json()) == 34


def test_a_fresh_server_instance_plans_the_points_it_is_sent(client, blank, monkeypatch):
    """The bug this design fixes: on Vercel the next request may land on a new instance."""
    _offline_enrich(monkeypatch)
    points: list[dict] = []
    for lat, lon in [(-7.2650, 112.7378), (-7.2900, 112.7500), (-7.3000, 112.7600), (-7.2550, 112.7450)]:
        points = _place(client, points, lat, lon)
    canvas.clear_caches()  # a new instance remembers nothing
    store.invalidate()
    b = canvas.bundle_for(points)
    assert len(b.floods) == 4
    n = len(b.depots) + 4 + len(b.ifs)
    assert b.distance_matrix.shape == (n, n)
    assert np.all(np.diag(b.distance_matrix) == 0)


def test_legs_sent_with_the_points_match_legs_measured_again(client, blank, monkeypatch):
    _offline_enrich(monkeypatch)
    points = _place(client, [], -7.2650, 112.7378)
    points = _place(client, points, -7.2900, 112.7500)
    sent = canvas.bundle_for(points)
    stale = [{**p, "legs": {**p["legs"], "key": "another-node-set"}} for p in points]
    measured = canvas.bundle_for(stale)
    assert np.allclose(sent.distance_matrix, measured.distance_matrix, atol=0.5)


def test_a_point_on_top_of_another_is_refused(client, blank, monkeypatch):
    _offline_enrich(monkeypatch)
    points = _place(client, [], -7.2650, 112.7378)
    r = client.post(
        "/api/data/floods/enrich",
        json={"point": {"lat": -7.26501, "lon": 112.73781}, "others": points},
    )
    assert r.status_code == 409


def test_canvas_points_are_not_stored_on_the_server(client, blank):
    r = client.post("/api/data/floods?scenario=kanvas", json={"lat": -7.26, "lon": 112.75})
    assert r.status_code == 409
    assert "browser" in r.json()["detail"]


def test_reset_leaves_the_study_areas_alone(client, blank):
    assert client.post("/api/scenarios/kanvas/reset").status_code == 204
    assert len(client.get("/api/data/floods?scenario=s2-jun").json()) == 34


def test_study_areas_cannot_be_reset(client):
    assert client.post("/api/scenarios/s2-jun/reset").status_code == 403


def test_osrm_tables_stay_within_the_public_servers_limit(monkeypatch):
    """router.project-osrm.org answers "TooBig" past 100 coordinates per table."""
    sizes = []

    def chunk(nlat, nlon, lats, lons, retries):
        sizes.append(len(lats) + 1)  # +1: the new point itself
        z = np.arange(len(lats), dtype=float)
        return z, z, z, z

    monkeypatch.setattr(enrich, "_osrm_chunk", chunk)
    n = 152  # depots + outlets, as on the canvas
    row, col, rt, ct = enrich._osrm_one_to_many(-7.27, 112.75, np.zeros(n), np.zeros(n))
    assert max(sizes) <= enrich.OSRM_TABLE_MAX_COORDS
    assert len(row) == n and not np.isnan(row).any()
