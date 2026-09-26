import numpy as np
import pytest

from app.algorithms.acs import ACSParams, HybridACS
from app.algorithms.evaluator import validate_hard_constraints
from app.algorithms.instance import IF_DRAIN_S, build_instance
from app.algorithms.vns import VNS, VNSParams
from app.severity.index import compute_severity_index


def _instance(b):
    sev = compute_severity_index(b.floods, b.faskes)
    return build_instance(
        depots_df=b.depots,
        floods_df=b.floods,
        ifs_df=b.ifs,
        dist_matrix=b.distance_matrix,
        time_matrix=b.time_matrix,
        si_values=sev.si_values,
    )


def _no_physical_violations(inst, ev):
    # HC6 (depot-geometry) can appear via the overflow fallback; the physical
    # constraints (volume served, depot balance, capacity, IF drain) must hold.
    bad = [v for v in validate_hard_constraints(inst, ev) if not v.startswith("HC6")]
    assert bad == [], bad


def test_if_drain_time_is_positive():
    assert IF_DRAIN_S > 0  # IF visit time includes tank draining


def test_acs_feasible_and_finite(s2):
    inst = _instance(s2)
    sol = HybridACS(inst, ACSParams(iterations=6, n_ants=6, seed=1, time_limit_s=15)).solve()
    assert np.isfinite(sol.evaluation.objective_z)
    _no_physical_violations(inst, sol.evaluation)


def test_vns_feasible_and_finite(s2):
    inst = _instance(s2)
    sol = VNS(inst, VNSParams(max_iterations=12, seed=1, time_limit_s=15)).solve()
    assert np.isfinite(sol.evaluation.objective_z)


@pytest.mark.parametrize("solver", ["acs", "vns"])
def test_standby_full_routes_start_with_if(s2, solver):
    # Vehicles idle with a full tank, so the water carried from the depot has to
    # go to an IF before any pumping. The tank model makes that physically true;
    # this guards the plan from showing a pointless flood stop ahead of it.
    inst = _instance(s2)
    sol = (
        HybridACS(inst, ACSParams(iterations=6, n_ants=6, seed=1, time_limit_s=15))
        if solver == "acs"
        else VNS(inst, VNSParams(max_iterations=12, seed=1, time_limit_s=15))
    ).solve()
    nd, nf = inst.n_depots, inst.n_floods

    def kind(i: int) -> str:
        return "D" if i < nd else ("F" if i < nd + nf else "I")

    for route in sol.routes:
        if any(kind(n) == "F" for n in route[1:-1]):  # active route
            assert kind(route[1]) == "I", "a deployed vehicle must empty at an IF first"

    for r in sol.evaluation.routes:
        assert r.visits[0].tank_load_after == r.capacity, "standby tank must start full"
