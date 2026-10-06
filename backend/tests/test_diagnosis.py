import numpy as np
import pytest

from app.algorithms.acs import ACSParams, HybridACS
from app.algorithms.diagnosis import (
    _gini,
    balance_metrics,
    diagnose_unserved,
    suggest_fixes,
)
from app.algorithms.evaluator import coverage_ratio
from app.algorithms.instance import DepotFleet, build_instance
from app.severity.index import compute_severity_index

REASONS = {"no_unit", "out_of_range", "far", "priority", "capacity", "unscheduled"}


def _instance(b, fleet=None):
    sev = compute_severity_index(b.floods, b.faskes)
    return build_instance(
        depots_df=b.depots,
        floods_df=b.floods,
        ifs_df=b.ifs,
        dist_matrix=b.distance_matrix,
        time_matrix=b.time_matrix,
        si_values=sev.si_values,
        fleet=fleet,
    )


def _solve(inst, seconds=6):
    return HybridACS(inst, ACSParams(iterations=40, n_ants=8, seed=3, time_limit_s=seconds)).solve()


@pytest.fixture(scope="module")
def tight(s2_module):
    """One short-shift crew per depot: plenty of work left undone."""
    fleet = {
        str(r["id"]): DepotFleet(units=[(3000, 1)], operating_s=45 * 60.0)
        for _, r in s2_module.depots.iterrows()
    }
    inst = _instance(s2_module, fleet)
    return inst, _solve(inst)


@pytest.fixture(scope="module")
def s2_module():
    from app.data.store import store

    return store.get("s2-jun")


def test_every_unserved_point_gets_a_known_reason(tight):
    inst, sol = tight
    found = diagnose_unserved(inst, sol.evaluation)
    assert found, "this fleet cannot finish the work"
    for u in found:
        assert u.reason in REASONS
        assert u.detail
        assert 0 < u.remaining_l <= u.demand_l + 1e-6
    # the same points the evaluator says are open
    assert {u.flood_id for u in found} == {
        str(inst.floods[int(i)]["id"]) for i in np.where(sol.evaluation.remaining_volume > 1.0)[0]
    }


def test_a_point_no_unit_can_reach_is_called_out(s2_module):
    # Only one depot keeps a vehicle; floods that depot cannot reach have no unit.
    keep = str(s2_module.depots.iloc[0]["id"])
    fleet = {
        str(r["id"]): DepotFleet(units=[(3000, 1)] if str(r["id"]) == keep else [])
        for _, r in s2_module.depots.iterrows()
    }
    inst = _instance(s2_module, fleet)
    sol = _solve(inst, 4)
    found = diagnose_unserved(inst, sol.evaluation)
    assert any(u.reason == "no_unit" for u in found)


def test_extra_unit_or_longer_shift_is_suggested_with_a_real_gain(tight):
    inst, sol = tight
    ev = sol.evaluation
    before = coverage_ratio(inst, ev) * 100
    suggestions = suggest_fixes(inst, sol.routes, sol.capacities, ev)

    assert suggestions
    for s in suggestions:
        assert s.coverage_before_pct == pytest.approx(before)
        assert s.coverage_after_pct > before
        assert s.kind in {"add_unit", "extend_shift"}
    assert [s.coverage_after_pct for s in suggestions] == sorted(
        (s.coverage_after_pct for s in suggestions), reverse=True
    )


def test_nothing_is_suggested_when_everything_is_served(s2_module):
    inst = _instance(s2_module)
    inst.volumes = inst.volumes * 0.02  # light enough that the fleet finishes
    sol = _solve(inst, 4)
    assert coverage_ratio(inst, sol.evaluation) == pytest.approx(1.0)
    assert diagnose_unserved(inst, sol.evaluation) == []
    assert suggest_fixes(inst, sol.routes, sol.capacities, sol.evaluation) == []


def test_balance_metrics_add_up(tight):
    inst, sol = tight
    ev = sol.evaluation
    m = balance_metrics(inst, ev)

    assert m.vehicles_total == len(inst.vehicles)
    assert m.makespan_s == pytest.approx(max(r.total_time for r in ev.routes if r.n_flood_visits))
    assert sum(d.flood_visits for d in m.depots) == ev.total_flood_visits
    assert sum(d.vehicles_total for d in m.depots) == len(inst.vehicles)
    assert 0.0 <= m.load_gini <= 1.0
    assert m.utilization_max_pct <= 100.0 + 1e-6, "no crew may exceed its own shift"


def test_gini_extremes():
    assert _gini(np.array([5.0, 5.0, 5.0, 5.0])) == pytest.approx(0.0)
    assert _gini(np.array([0.0, 0.0, 0.0, 10.0])) == pytest.approx(0.75)
    assert _gini(np.array([])) == 0.0
    assert _gini(np.zeros(3)) == 0.0


# --- rolling horizon over the API -------------------------------------------------


def test_response_carries_diagnosis_fields(client):
    body = client.post(
        "/api/optimize/acs?scenario=s2-jun", json={"time_limit_s": 5, "iterations": 20}
    ).json()
    assert isinstance(body["unserved"], list)
    assert isinstance(body["suggestions"], list)
    assert body["balance"]["vehicles_total"] == 24
    assert all(r["shift_limit_s"] > 0 for r in body["routes"])
    assert body["unserved"] == sorted(
        body["unserved"], key=lambda u: (-u["si_value"] * u["remaining_l"], u["flood_id"])
    )


def test_remaining_volumes_become_the_next_periods_work(client, s2_module):
    ids = [str(i) for i in s2_module.floods["id"]]
    carry = {ids[0]: 4000.0, ids[1]: 2500.0}
    r = client.post(
        "/api/optimize/acs?scenario=s2-jun",
        json={"remaining_volumes": carry, "time_limit_s": 4, "iterations": 20},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["demand_total_l"] == pytest.approx(6500.0)
    served = {v["node_id"] for rt in body["routes"] for v in rt["visits"] if v["node_type"] == "flood"}
    assert served <= set(carry), "only the carried-over points are visited"


def test_carry_over_is_validated(client):
    url = "/api/optimize/acs?scenario=s2-jun"
    assert client.post(url, json={"remaining_volumes": {"nope": 100}}).status_code == 422
    assert client.post(url, json={"remaining_volumes": {}}).status_code == 422
    assert client.post(url, json={"remaining_volumes": {"F_0000": -5}}).status_code == 422
