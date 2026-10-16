import json

import httpx
import numpy as np
import pytest

from app import config
from app.traffic import live as traffic


def _grid(n: int) -> np.ndarray:
    """Travel times that grow with index distance, symmetric, zero diagonal."""
    idx = np.arange(n)
    return np.abs(idx[:, None] - idx[None, :]).astype(float) * 60.0


def test_sample_pairs_puts_dispatch_legs_first_and_keeps_the_budget():
    t = _grid(12)  # 2 depots, 4 floods, 6 outlets
    plan = traffic.sample_pairs(t, n_depots=2, n_floods=4, dispatch_limit_s=180.0, budget=5)

    pairs = [(o, d) for o, ds in plan.items() for d in ds]
    assert len(pairs) == 5
    assert all(o < 2 for o, _ in pairs[:3]), "depot -> flood legs come first"
    assert all(o != d for o, d in pairs)


def test_sample_pairs_covers_outlets_and_neighbouring_floods():
    t = _grid(12)
    plan = traffic.sample_pairs(t, n_depots=2, n_floods=4, dispatch_limit_s=180.0, budget=999)
    pairs = {(o, d) for o, ds in plan.items() for d in ds}
    floods, outlets = range(2, 6), range(6, 12)
    assert any(o in floods and d in outlets for o, d in pairs)
    assert any(o in floods and d in floods for o, d in pairs)


def test_node_factors_take_the_median_and_borrow_for_unmeasured_nodes():
    t = _grid(5)
    ratios = {(0, 1): 1.2, (0, 2): 1.6, (1, 2): 2.0}
    f = traffic.node_factors(5, ratios, t)

    assert f[0] == pytest.approx(1.4)  # median of 1.2 and 1.6
    assert f[2] == pytest.approx(1.8)
    assert 1.0 <= f[4] <= 4.0, "node 4 was never measured but still gets a factor"


def test_apply_traffic_never_makes_a_leg_faster_and_keeps_sampled_ratios():
    t = _grid(4)
    snap = traffic.TrafficSnapshot(
        factors=np.array([1.0, 1.5, 2.0, 1.0]),
        ratios={(0, 1): 1.3},
        fetched_at=traffic.datetime.now(traffic.timezone.utc),
        requested_pairs=1,
    )
    adj = traffic.apply_traffic(t, snap)

    assert adj[0, 1] == pytest.approx(t[0, 1] * 1.3)
    assert adj[1, 2] == pytest.approx(t[1, 2] * np.sqrt(1.5 * 2.0))
    assert np.all(adj >= t - 1e-9)
    assert np.all(np.diag(adj) == 0.0)


def test_fetch_ratios_reads_the_routes_api_matrix():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["key"] = request.headers.get("X-Goog-Api-Key")
        seen["mask"] = request.headers.get("X-Goog-FieldMask")
        body = json.loads(request.content)
        assert body["routingPreference"] == "TRAFFIC_AWARE"
        assert len(body["destinations"]) == 2
        return httpx.Response(
            200,
            json=[
                {"originIndex": 0, "destinationIndex": 0, "condition": "ROUTE_EXISTS",
                 "duration": "390s", "staticDuration": "300s"},
                {"originIndex": 0, "destinationIndex": 1, "condition": "ROUTE_NOT_FOUND"},
            ],
        )

    coords = np.array([[-7.25, 112.75], [-7.26, 112.76], [-7.27, 112.77]])
    ratios = traffic.fetch_ratios(coords, {0: [1, 2]}, "test-key", httpx.MockTransport(handler))

    assert ratios == {(0, 1): pytest.approx(1.3)}
    assert seen["key"] == "test-key"
    assert "staticDuration" in seen["mask"]


def test_a_rejected_key_is_reported_not_raised_as_a_crash():
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json={"error": {"message": "API key not valid"}})

    coords = np.array([[-7.25, 112.75], [-7.26, 112.76]])
    with pytest.raises(traffic.TrafficUnavailable, match="403"):
        traffic.fetch_ratios(coords, {0: [1]}, "bad", httpx.MockTransport(handler))


def test_status_endpoint_reports_configuration(client, monkeypatch):
    monkeypatch.setattr(config, "GOOGLE_MAPS_API_KEY", "")
    assert client.get("/api/traffic/status").json()["routes_api_configured"] is False
    monkeypatch.setattr(config, "GOOGLE_MAPS_API_KEY", "abc")
    assert client.get("/api/traffic/status").json()["routes_api_configured"] is True


def test_run_without_a_key_falls_back_to_free_flow(client, monkeypatch):
    monkeypatch.setattr(config, "GOOGLE_MAPS_API_KEY", "")
    traffic.clear_cache()
    r = client.post(
        "/api/optimize/vns?scenario=s1-jan",
        json={"max_iterations": 3, "time_limit_s": 3, "seed": 1, "use_traffic": True},
    )
    assert r.status_code == 200, r.text
    info = r.json()["traffic"]
    assert info["requested"] is True and info["applied"] is False
    assert "GOOGLE_MAPS_API_KEY" in info["message"]


def test_run_with_traffic_plans_on_slower_roads(client, monkeypatch):
    monkeypatch.setattr(config, "GOOGLE_MAPS_API_KEY", "abc")
    traffic.clear_cache()
    # Every queried leg is 50% slower than free flow.
    monkeypatch.setattr(
        traffic,
        "fetch_ratios",
        lambda coords, plan, key, transport=None: {
            (o, d): 1.5 for o, ds in plan.items() for d in ds
        },
    )
    body = {"max_iterations": 3, "time_limit_s": 3, "seed": 1}
    free = client.post("/api/optimize/vns?scenario=s1-jan", json=body).json()
    jammed = client.post("/api/optimize/vns?scenario=s1-jan", json={**body, "use_traffic": True}).json()
    traffic.clear_cache()

    assert free["traffic"] is None
    info = jammed["traffic"]
    assert info["applied"] is True
    assert info["mean_factor"] == pytest.approx(1.5)
    assert info["sampled_pairs"] > 0


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
