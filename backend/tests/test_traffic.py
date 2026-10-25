import httpx
import numpy as np
import pytest

from app import config
from app.data import canvas
from app.data.store import store
from app.preprocessing import enrich
from app.traffic import live as traffic

RUN = {"max_iterations": 3, "time_limit_s": 3, "seed": 1}


def _grid(n: int) -> np.ndarray:
    """Travel times that grow with index distance, symmetric, zero diagonal."""
    idx = np.arange(n)
    return np.abs(idx[:, None] - idx[None, :]).astype(float) * 60.0


@pytest.fixture(autouse=True)
def _isolated_usage(tmp_path, monkeypatch):
    """Each test starts with an empty daily count in its own file."""
    monkeypatch.setattr(traffic, "USAGE_FILE", tmp_path / "usage.json")
    monkeypatch.setattr(traffic, "_usage", None)
    traffic.clear_cache()
    yield
    traffic.clear_cache()


def test_sample_nodes_puts_floods_first_then_dispatching_depots_and_outlets():
    t = _grid(12)  # 2 depots (0-1), 4 floods (2-5), 6 outlets (6-11)
    nodes = traffic.sample_nodes(t, n_depots=2, n_floods=4, dispatch_limit_s=180.0, budget=99)

    assert nodes[:4] == [2, 3, 4, 5], "floods come first"
    assert len(nodes) == len(set(nodes))
    assert set(nodes) & {0, 1}, "depots that dispatch are sampled"
    assert set(nodes) & set(range(6, 12)), "each flood's nearest outlets are sampled"


def test_sample_nodes_keeps_the_budget():
    t = _grid(12)
    assert len(traffic.sample_nodes(t, 2, 4, 180.0, budget=3)) == 3


def test_node_factors_keep_measured_values_and_borrow_for_the_rest():
    t = _grid(5)
    f = traffic.node_factors(5, {0: 1.2, 2: 1.8}, t)

    assert f[0] == pytest.approx(1.2)
    assert f[2] == pytest.approx(1.8)
    assert 1.0 <= f[4] <= 4.0, "node 4 was never measured but still gets a factor"


def test_apply_traffic_scales_legs_by_both_ends_and_never_speeds_up():
    t = _grid(4)
    snap = traffic.TrafficSnapshot(
        factors=np.array([1.0, 1.5, 2.0, 1.0]),
        measured={1: 1.5, 2: 2.0},
        fetched_at=traffic.datetime.now(traffic.timezone.utc),
        requested_points=2,
    )
    adj = traffic.apply_traffic(t, snap)

    assert adj[1, 2] == pytest.approx(t[1, 2] * np.sqrt(1.5 * 2.0))
    assert np.all(adj >= t - 1e-9)
    assert np.all(np.diag(adj) == 0.0)


def _flow(current: float, free: float, confidence: float = 1.0) -> dict:
    return {"flowSegmentData": {
        "currentTravelTime": current, "freeFlowTravelTime": free, "confidence": confidence,
    }}


def test_fetch_factors_reads_tomtom_flow_segment_data():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        point = request.url.params["point"]
        if point.startswith("-7.25"):
            return httpx.Response(200, json=_flow(130, 100))  # 30% slower, sure
        if point.startswith("-7.26"):
            return httpx.Response(200, json=_flow(200, 100, confidence=0.5))
        return httpx.Response(400, json={"detailedError": {"message": "no segment"}})

    coords = np.array([[-7.25, 112.75], [-7.26, 112.76], [-7.27, 112.77]])
    factors = traffic.fetch_factors(coords, [0, 1, 2], "test-key", httpx.MockTransport(handler))

    assert factors[0] == pytest.approx(1.3)
    assert factors[1] == pytest.approx(1.5), "ratio 2.0 shrunk halfway by confidence 0.5"
    assert 2 not in factors, "a point without a road segment is skipped"
    assert all(r.url.params["key"] == "test-key" for r in seen)
    assert "flowSegmentData" in str(seen[0].url)


def test_a_rejected_key_is_reported_not_raised_as_a_crash():
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json={"detailedError": {"message": "Forbidden"}})

    coords = np.array([[-7.25, 112.75], [-7.26, 112.76]])
    with pytest.raises(traffic.TrafficUnavailable, match="403"):
        traffic.fetch_factors(coords, [0, 1], "bad", httpx.MockTransport(handler))


def test_daily_cap_refuses_a_refresh_that_does_not_fit(monkeypatch):
    monkeypatch.setattr(config, "TOMTOM_FLOW_DAILY_LIMIT", 5)
    traffic._reserve(4)
    assert traffic.usage_today() == 4
    with pytest.raises(traffic.TrafficUnavailable, match="Batas harian"):
        traffic._reserve(2)
    assert traffic.usage_today() == 4


def test_status_endpoint_reports_configuration(client, monkeypatch):
    monkeypatch.setattr(config, "TOMTOM_API_KEY", "")
    body = client.get("/api/traffic/status").json()
    assert body["configured"] is False and body["provider"] == "tomtom"
    monkeypatch.setattr(config, "TOMTOM_API_KEY", "abc")
    assert client.get("/api/traffic/status").json()["configured"] is True


@pytest.fixture()
def canvas_with_points(tmp_path, monkeypatch):
    """A blank canvas in a temp folder with two hand-placed points, offline."""
    monkeypatch.setattr(config, "WRITABLE_ROOT", tmp_path / "data")
    monkeypatch.setattr(enrich, "enrich_attrs", lambda lat, lon, **_: (2, 150.0))

    def vectors(lat, lon, lats, lons):
        d = np.hypot(lats - lat, lons - lon) * 111_000.0
        return d, d, d / 8.0, d / 8.0

    monkeypatch.setattr(enrich, "node_vectors", vectors)
    store.invalidate(canvas.CANVAS_ID)
    canvas.reset()
    from fastapi.testclient import TestClient

    from app.main import app

    c = TestClient(app)
    for lat, lon in [(-7.2650, 112.7378), (-7.2900, 112.7500)]:
        r = c.post("/api/data/floods?scenario=kanvas", json={"lat": lat, "lon": lon, "ketinggian_cm": 30})
        assert r.status_code in (200, 201), r.text
    yield c
    store.invalidate(canvas.CANVAS_ID)


def test_canvas_run_without_a_key_falls_back_to_free_flow(canvas_with_points, monkeypatch):
    monkeypatch.setattr(config, "TOMTOM_API_KEY", "")
    r = canvas_with_points.post("/api/optimize/vns?scenario=kanvas", json={**RUN, "use_traffic": True})
    assert r.status_code == 200, r.text
    info = r.json()["traffic"]
    assert info["requested"] is True and info["applied"] is False
    assert "TOMTOM_API_KEY" in info["message"]


def test_canvas_run_with_traffic_plans_on_slower_roads(canvas_with_points, monkeypatch):
    monkeypatch.setattr(config, "TOMTOM_API_KEY", "abc")
    # Every queried point is 50% slower than free flow.
    monkeypatch.setattr(
        traffic, "fetch_factors", lambda coords, nodes, key, transport=None: {n: 1.5 for n in nodes}
    )
    free = canvas_with_points.post("/api/optimize/vns?scenario=kanvas", json=RUN).json()
    jammed = canvas_with_points.post(
        "/api/optimize/vns?scenario=kanvas", json={**RUN, "use_traffic": True}
    ).json()

    assert free["traffic"] is None
    info = jammed["traffic"]
    assert info["applied"] is True and info["source"] == "tomtom-flow"
    assert info["mean_factor"] == pytest.approx(1.5)
    assert info["sampled_points"] > 0


def test_study_areas_ignore_live_traffic(client, monkeypatch):
    monkeypatch.setattr(config, "TOMTOM_API_KEY", "abc")

    def must_not_be_called(*_a, **_k):
        raise AssertionError("study areas must not ask TomTom")

    monkeypatch.setattr(traffic, "fetch_factors", must_not_be_called)
    r = client.post("/api/optimize/vns?scenario=s1-jan", json={**RUN, "use_traffic": True})
    assert r.status_code == 200, r.text
    info = r.json()["traffic"]
    assert info["requested"] is True and info["applied"] is False
    assert "Kanvas" in info["message"]


def test_dotenv_values_do_not_override_the_environment(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text('# comment\nTRAFFIC_TEST_A="from-file"\nexport TRAFFIC_TEST_B=b\n', encoding="utf-8")
    monkeypatch.setenv("TRAFFIC_TEST_A", "from-env")
    monkeypatch.delenv("TRAFFIC_TEST_B", raising=False)
    config._load_dotenv(env)

    import os

    assert os.environ["TRAFFIC_TEST_A"] == "from-env"
    assert os.environ["TRAFFIC_TEST_B"] == "b"
    monkeypatch.delenv("TRAFFIC_TEST_B", raising=False)
