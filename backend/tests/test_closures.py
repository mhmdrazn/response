"""Switching depots off and closing outlets for a run."""

import numpy as np
import pandas as pd
import pytest
from fastapi import HTTPException

from app.data.store import store
from app.routers.optimize import _without_closed

RUN = {"max_iterations": 3, "time_limit_s": 3, "seed": 1}


def test_without_closed_drops_rows_and_matrix_cells_together():
    depots = pd.DataFrame({"id": ["D1", "D2"]})
    floods = pd.DataFrame({"id": ["F1"]})
    ifs = pd.DataFrame({"id": ["I1", "I2", "I3"]})
    # Node order D1 D2 F1 I1 I2 I3; each cell encodes its own (row, column).
    m = np.array([[10 * r + c for c in range(6)] for r in range(6)], dtype=float)

    d, i, dist, tmat = _without_closed(depots, floods, ifs, m, None, {"D1"}, {"I2"})

    assert list(d["id"]) == ["D2"]
    assert list(i["id"]) == ["I1", "I3"]
    kept = [1, 2, 3, 5]
    assert np.array_equal(dist, m[np.ix_(kept, kept)])
    assert tmat is None


def test_without_closed_is_a_no_op_when_nothing_is_closed():
    depots = pd.DataFrame({"id": ["D1"]})
    ifs = pd.DataFrame({"id": ["I1"]})
    m = np.zeros((3, 3))
    d, i, dist, _ = _without_closed(depots, pd.DataFrame({"id": ["F1"]}), ifs, m, m, set(), set())
    assert d is depots and i is ifs and dist is m


@pytest.mark.parametrize("which", ["depots", "ifs"])
def test_closing_everything_is_refused(which):
    depots = pd.DataFrame({"id": ["D1"]})
    ifs = pd.DataFrame({"id": ["I1"]})
    off_d = {"D1"} if which == "depots" else set()
    off_i = {"I1"} if which == "ifs" else set()
    with pytest.raises(HTTPException) as exc:
        _without_closed(depots, pd.DataFrame({"id": ["F1"]}), ifs, None, None, off_d, off_i)
    assert exc.value.status_code == 422


def test_run_never_uses_a_disabled_depot_or_a_closed_outlet(client):
    bundle = store.get("s1-jan")
    depot_off = str(bundle.depots["id"].iloc[0])
    base = client.post("/api/optimize/vns?scenario=s1-jan", json=RUN).json()
    used_ifs = [
        v["node_id"] for r in base["routes"] for v in r["visits"] if v["node_type"] == "if"
    ]
    assert used_ifs, "the baseline plan should empty its tanks somewhere"
    if_off = used_ifs[0]

    r = client.post(
        "/api/optimize/vns?scenario=s1-jan",
        json={**RUN, "disabled_depots": [depot_off], "closed_ifs": [if_off]},
    )
    assert r.status_code == 200, r.text
    routes = r.json()["routes"]
    assert routes
    assert all(rt["depot_id"] != depot_off for rt in routes)
    visited = {v["node_id"] for rt in routes for v in rt["visits"]}
    assert depot_off not in visited
    assert if_off not in visited


def test_run_with_every_depot_off_explains_why(client):
    ids = [str(i) for i in store.get("s1-jan").depots["id"]]
    r = client.post("/api/optimize/vns?scenario=s1-jan", json={**RUN, "disabled_depots": ids})
    assert r.status_code == 422
    assert "depo" in r.json()["detail"].lower()
