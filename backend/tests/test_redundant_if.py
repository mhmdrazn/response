"""Outlet stops that drain an already empty tank are removed (drop_redundant_if_stops)."""

import numpy as np
import pytest

from app.algorithms.acs import ACSParams, HybridACS
from app.algorithms.evaluator import (
    count_redundant_if_stops,
    drop_redundant_if_stops,
    evaluate_solution,
    validate_hard_constraints,
)
from app.algorithms.instance import build_instance
from app.algorithms.vns import VNS, VNSParams
from app.severity.index import compute_severity_index


def _instance(b):
    sev = compute_severity_index(b.floods, b.faskes)
    return build_instance(
        depots_df=b.depots, floods_df=b.floods, ifs_df=b.ifs,
        dist_matrix=b.distance_matrix, time_matrix=b.time_matrix, si_values=sev.si_values,
    )


def _pumped(ev):
    return sum(v.volume_pumped for r in ev.routes for v in r.visits)


def _one_route(inst):
    """depot -> outlet -> flood -> outlet -> flood -> outlet -> depot, all in range."""
    depot, cap = next(
        (d, c) for d, c in inst.vehicles if len(inst.depot_flood_sets.get(d, ())) >= 2
    )
    floods = sorted(inst.depot_flood_sets[depot])[:2]
    a, b = inst.if_indices[0], inst.if_indices[1]
    return [depot, a, floods[0], b, floods[1], a, depot], [cap]


def test_a_doubled_outlet_stop_is_dropped(s2):
    inst = _instance(s2)
    route, caps = _one_route(inst)
    i = route.index(route[3])  # the outlet after the first flood
    doubled = route[: i + 1] + [route[i]] + route[i + 1 :]  # ... IF, IF, flood ...
    before = evaluate_solution(inst, [doubled], caps)
    assert count_redundant_if_stops(before) == 1

    cleaned = drop_redundant_if_stops(inst, [doubled], caps)
    after = evaluate_solution(inst, cleaned, caps)
    assert len(cleaned[0]) == len(doubled) - 1
    assert count_redundant_if_stops(after) == 0
    assert after.score <= before.score
    assert after.total_time < before.total_time
    assert _pumped(after) == pytest.approx(_pumped(before))
    assert np.allclose(after.remaining_volume, before.remaining_volume)
    assert validate_hard_constraints(inst, after) == []


def test_an_outlet_before_the_depot_after_draining_is_dropped(s2):
    inst = _instance(s2)
    route, caps = _one_route(inst)
    # ... flood -> IF -> IF -> depot: the second outlet drains an empty tank.
    tail = route[:-1] + [inst.if_indices[2], route[-1]]
    before = evaluate_solution(inst, [tail], caps)
    cleaned = drop_redundant_if_stops(inst, [tail], caps)
    after = evaluate_solution(inst, cleaned, caps)
    assert cleaned[0] == route
    assert after.total_if_visits == before.total_if_visits - 1
    assert after.score <= before.score
    assert _pumped(after) == pytest.approx(_pumped(before))


def test_the_first_outlet_of_a_route_is_kept(s2):
    """A crew leaves with a full tank, so its first outlet stop is needed."""
    inst = _instance(s2)
    route, caps = _one_route(inst)
    assert drop_redundant_if_stops(inst, [route], caps)[0] == route


@pytest.mark.parametrize("solver", ["acs", "vns"])
def test_solvers_return_no_redundant_outlet_stops(s2, solver):
    inst = _instance(s2)
    if solver == "acs":
        sol = HybridACS(inst, ACSParams(seed=3, time_limit_s=8)).solve()
    else:
        sol = VNS(inst, VNSParams(seed=3, time_limit_s=8)).solve()
    assert count_redundant_if_stops(sol.evaluation) == 0
    for r in sol.routes:
        assert not any(
            a in inst.if_indices and b in inst.if_indices for a, b in zip(r, r[1:])
        )
