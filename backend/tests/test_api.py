def test_health(client):
    assert client.get("/health").json()["status"] == "ok"


def test_scenarios_list(client):
    body = client.get("/api/scenarios").json()
    assert body["default"] == "s2-jun"
    ids = {s["id"] for s in body["scenarios"]}
    assert {"s1-jan", "s2-jun", "s3-nov"} <= ids


def test_floods_default_scenario(client):
    assert len(client.get("/api/data/floods").json()) == 34


def test_floods_specific_scenario(client):
    assert len(client.get("/api/data/floods?scenario=s1-jan").json()) == 17


def test_floods_unknown_scenario_is_404(client):
    assert client.get("/api/data/floods?scenario=nope").status_code == 404


def test_shared_datasets_are_scenario_independent(client):
    a = len(client.get("/api/data/depo?scenario=s1-jan").json())
    b = len(client.get("/api/data/depo?scenario=s2-jun").json())
    assert a == b == 12


def test_severity(client):
    assert client.get("/api/severity-index").status_code == 200


def test_optimize_acs(client):
    r = client.post(
        "/api/optimize/acs",
        json={"iterations": 4, "n_ants": 4, "seed": 1, "time_limit_s": 10},
    )
    assert r.status_code == 200
    assert "objective_z" in r.json()
