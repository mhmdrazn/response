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


def test_floods_carry_volume_and_its_factors(client):
    # The detail panel shows how a volume estimate arises, so the API has to send
    # the factors with it, and they must multiply back to the stored figure.
    for f in client.get("/api/data/floods?scenario=s2-jun").json():
        assert f["volume_l"] is not None
        rebuilt = f["road_width_m"] * f["ponding_length_m"] * f["effective_depth_cm"] / 100 * 1000
        assert abs(rebuilt - f["volume_l"]) < 1.0, f["id"]


def test_a_read_only_filesystem_is_a_clear_503_not_a_bare_500(client, monkeypatch):
    import errno

    from app.routers import data as data_router

    def refuse(*_args, **_kwargs):
        raise OSError(errno.EROFS, "Read-only file system")

    monkeypatch.setattr(data_router, "_persist", refuse)
    depot_id = client.get("/api/data/depo").json()[0]["id"]
    r = client.put(f"/api/data/depo/{depot_id}", json={"name": "Uji"})

    assert r.status_code == 503
    assert "hanya-baca" in r.json()["detail"]


def test_depot_edit_on_a_read_only_deployment_is_saved_under_tmp(client, monkeypatch, tmp_path):
    # On Vercel the deployed CSVs are read-only and only /tmp can be written, so
    # an edit goes to a mirror there and reads pick it up from that copy.
    from app import config
    from app.data.store import store

    original = config.SHARED_FILES["depo"]
    before = original.read_bytes()
    monkeypatch.setattr(config, "WRITABLE_ROOT", tmp_path)
    store.invalidate_shared()
    try:
        depot_id = client.get("/api/data/depo").json()[0]["id"]
        r = client.put(f"/api/data/depo/{depot_id}", json={"name": "Pos Uji Vercel"})

        assert r.status_code == 200, r.text
        assert r.json()["name"] == "Pos Uji Vercel"
        saved = tmp_path / original.relative_to(config.DATA_ROOT)
        assert saved.exists(), "the edit should land in the writable mirror"
        assert original.read_bytes() == before, "the deployed file must stay untouched"

        names = {d["id"]: d["name"] for d in client.get("/api/data/depo").json()}
        assert names[depot_id] == "Pos Uji Vercel", "reads must prefer the saved copy"
    finally:
        monkeypatch.undo()
        store.invalidate_shared()


def test_writable_root_falls_back_to_tmp_when_the_data_folder_is_read_only(monkeypatch):
    import tempfile

    from app import config

    monkeypatch.delenv("WRITABLE_ROOT", raising=False)
    monkeypatch.setenv("VERCEL", "1")
    assert config._writable_root() == config.Path(tempfile.gettempdir()) / "response-data"

    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setattr(config.os, "access", lambda *_a, **_k: False)
    assert config._writable_root() == config.Path(tempfile.gettempdir()) / "response-data"
