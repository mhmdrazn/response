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
    # Every hard constraint must hold, the dispatch range (HC6) included: there
    # is no longer an overflow path that may send an out-of-range crew.
    bad = validate_hard_constraints(inst, ev)
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


def test_acs_global_update_touches_only_best_route_arcs(s2):
    # Standard ACS: evaporation and deposit both apply only to the arcs of the
    # best solution, τ = (1 − ρ) τ + ρ / best_score, kept symmetric. Every other
    # arc must come out exactly as it went in.
    inst = _instance(s2)
    solver = HybridACS(inst, ACSParams(seed=3, rho=0.15))
    rng = np.random.default_rng(0)
    tau = rng.uniform(1e-7, 1e-5, size=solver.pheromone.shape)
    solver.pheromone = (tau + tau.T) / 2  # symmetric, all values distinct
    before = solver.pheromone.copy()

    routes, _ = solver._construct_one_ant()
    solver.pheromone = before.copy()  # undo the ant's local updates
    best_score = 1_234_567.0
    solver._global_update(routes, best_score)

    on_route = np.zeros_like(before, dtype=bool)
    for route in routes:
        for a, b in zip(route[:-1], route[1:]):
            on_route[a, b] = on_route[b, a] = True
    assert on_route.any()

    after = solver.pheromone
    assert np.array_equal(after[~on_route], before[~on_route])
    expected = (1 - 0.15) * before[on_route] + 0.15 / best_score
    assert np.allclose(after[on_route], expected, rtol=0, atol=1e-18)
    assert np.array_equal(after, after.T)


def test_vns_parallel_construction_spreads_work_over_the_fleet(s2):
    """Building crews one after another left most of the fleet idle and Z high."""
    from app.algorithms.evaluator import evaluate_solution
    from app.algorithms.instance import build_instance
    from app.algorithms.vns import VNS, VNSParams
    from app.severity.index import compute_severity_index

    sev = compute_severity_index(s2.floods, s2.faskes)
    inst = build_instance(
        depots_df=s2.depots, floods_df=s2.floods, ifs_df=s2.ifs,
        dist_matrix=s2.distance_matrix, time_matrix=s2.time_matrix, si_values=sev.si_values,
    )
    v = VNS(inst, VNSParams(seed=1))
    caps = [c for _, c in inst.vehicles]

    def used_and_z(routes):
        ev = evaluate_solution(inst, routes, caps)
        return sum(1 for r in ev.routes if r.n_flood_visits > 0), ev.objective_z

    par_used, par_z = used_and_z(v._build_parallel(inst.volumes.copy()))
    seq_used, seq_z = used_and_z(v._build_sequential(inst.volumes.copy()))
    assert par_used > seq_used
    assert par_z < seq_z
    for routes in (v._build_parallel(inst.volumes.copy()), v._build_sequential(inst.volumes.copy())):
        assert all(r[0] == r[-1] == d for r, (d, _) in zip(routes, inst.vehicles))


def test_vns_split_hands_a_route_tail_to_an_idle_crew(s2):
    from app.algorithms.instance import build_instance
    from app.algorithms.vns import VNS, VNSParams
    from app.severity.index import compute_severity_index

    sev = compute_severity_index(s2.floods, s2.faskes)
    inst = build_instance(
        depots_df=s2.depots, floods_df=s2.floods, ifs_df=s2.ifs,
        dist_matrix=s2.distance_matrix, time_matrix=s2.time_matrix, si_values=sev.si_values,
    )
    v = VNS(inst, VNSParams(seed=2))
    routes = v._build_sequential(inst.volumes.copy())
    before = sorted(n for r in routes for n in r[1:-1] if n in v._flood_set)
    active_before = len(v._active_routes(routes))
    v._shake_split_to_idle(routes)
    after = sorted(n for r in routes for n in r[1:-1] if n in v._flood_set)
    assert after == before  # no flood visit lost or duplicated
    assert len(v._active_routes(routes)) == active_before + 1
    assert all(r[0] == r[-1] == d for r, (d, _) in zip(routes, inst.vehicles))
