import pytest

from app.data import registry
from app.data.store import store


def test_default_scenario_is_s2():
    assert registry.default_id() == "s2-jun"


def test_resolve_unknown_raises():
    with pytest.raises(KeyError):
        registry.resolve("does-not-exist")


def test_bundle_shapes_consistent(s2):
    assert len(s2.floods) == 34
    assert len(s2.depots) == 12
    n = len(s2.depots) + len(s2.floods) + len(s2.ifs)
    assert s2.distance_matrix is not None
    assert s2.distance_matrix.shape == (n, n)


def test_get_is_cached():
    assert store.get("s2-jun") is store.get("s2-jun")


def test_invalidate_reloads():
    a = store.get("s2-jun")
    store.invalidate("s2-jun")
    assert store.get("s2-jun") is not a


def test_depot_address_is_read_and_legacy_city_columns_still_load(tmp_path):
    from app.data.loaders import load_depots

    modern = tmp_path / "modern.csv"
    modern.write_text(
        "osm_id,type,lat,lon,name,address\n1,way,-7.25, 112.75,Pos A,\"Jl. Contoh 1, Surabaya\"\n",
        encoding="utf-8",
    )
    legacy = tmp_path / "legacy.csv"
    legacy.write_text(
        "osm_id,type,lat,lon,name,addr:city\n1,way,-7.25,112.75,Pos A,Surabaya\n", encoding="utf-8"
    )

    new = load_depots(modern)
    old = load_depots(legacy)
    assert new.loc[0, "address"] == "Jl. Contoh 1, Surabaya"
    assert float(new.loc[0, "lon"]) == 112.75, "a space before the longitude must not drop the row"
    assert old.loc[0, "address"] == "Surabaya", "files with the old column keep working"
    assert "city" not in new.columns and "city" not in old.columns


def test_depots_api_serves_the_address(client):
    first = client.get("/api/data/depo").json()[0]
    assert "address" in first and "city" not in first
    assert first["address"], "every depot in the bundled data has an address"
