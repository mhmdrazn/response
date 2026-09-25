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
