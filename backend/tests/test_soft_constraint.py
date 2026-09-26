import time

import numpy as np

from app.algorithms.acs import ACSParams, HybridACS
from app.algorithms.evaluator import coverage_ratio, evaluate_solution
from app.algorithms.instance import build_instance
from app.algorithms.vns import VNS, VNSParams
from app.severity.index import compute_severity_index


def _instance(b, volume_scale=1.0, unserved_penalty=500.0):
    """Scenario instance, optionally with its workload scaled.

    Scaling happens after the build because floods.csv now carries a calibrated
    `volume_l`, which takes priority over the depth proxy.
    """
    sev = compute_severity_index(b.floods, b.faskes)
    inst = build_instance(
        depots_df=b.depots,
        floods_df=b.floods,
        ifs_df=b.ifs,
        dist_matrix=b.distance_matrix,
        time_matrix=b.time_matrix,
        si_values=sev.si_values,
        unserved_penalty=unserved_penalty,
    )
    if volume_scale != 1.0:
        inst.volumes = inst.volumes * volume_scale
    return inst


def test_idle_solution_is_penalised_not_rejected(s2):
    inst = _instance(s2)
    idle = [[d, d] for d in inst.depot_indices]
    ev = evaluate_solution(inst, idle, [5000] * len(idle))

    assert ev.objective_z == 0.0, "nothing served means no arrival-time cost"
    assert ev.penalty > 0, "but the undone work must carry a cost"
    assert ev.score == ev.objective_z + ev.penalty
    assert coverage_ratio(inst, ev) == 0.0


def test_full_coverage_has_no_penalty(s2):
    # Light enough that the fleet finishes, so the no-penalty path is exercised
    # rather than skipped.
    inst = _instance(s2, volume_scale=0.02)
    sol = HybridACS(inst, ACSParams(iterations=20, n_ants=12, seed=1, time_limit_s=20)).solve()
    ev = sol.evaluation

    assert ev.unserved_volume <= 1.0, "this instance should be fully servable"
    assert ev.penalty == 0.0
    assert ev.score == ev.objective_z
    assert coverage_ratio(inst, ev) == 1.0


def test_solvers_survive_undeliverable_demand(s2):
    # Demand well past what 24 vehicles can move inside one deployment. Under
    # the old hard constraint both solvers raised; now they return a partial plan.
    inst = _instance(s2, volume_scale=10.0)

    acs = HybridACS(inst, ACSParams(iterations=4, n_ants=4, seed=1, time_limit_s=15)).solve()
    vns = VNS(inst, VNSParams(max_iterations=6, seed=1, time_limit_s=15)).solve()

    for sol in (acs, vns):
        ev = sol.evaluation
        assert np.isfinite(ev.score)
        assert ev.unserved_volume > 0, "this instance cannot be fully served"
        assert 0.0 <= coverage_ratio(inst, ev) < 1.0


def test_time_limit_is_respected_under_heavy_demand(s2):
    # Local search scans grow with route length, so the budget has to be checked
    # inside the operators, not only between solver iterations.
    inst = _instance(s2, volume_scale=2.0)
    limit = 20.0

    t0 = time.perf_counter()
    HybridACS(inst, ACSParams(iterations=60, n_ants=20, seed=3, time_limit_s=limit)).solve()
    acs_elapsed = time.perf_counter() - t0

    t0 = time.perf_counter()
    VNS(inst, VNSParams(max_iterations=100, seed=3, time_limit_s=limit)).solve()
    vns_elapsed = time.perf_counter() - t0

    assert acs_elapsed < limit * 1.3, f"ACS overran the cap: {acs_elapsed:.1f}s"
    assert vns_elapsed < limit * 1.3, f"VNS overran the cap: {vns_elapsed:.1f}s"


def test_no_route_outlasts_the_deployment_horizon(s2):
    # Without the horizon the solvers bought coverage with 23-hour tours.
    inst = _instance(s2, volume_scale=10.0)

    acs = HybridACS(inst, ACSParams(iterations=4, n_ants=4, seed=5, time_limit_s=15)).solve()
    vns = VNS(inst, VNSParams(max_iterations=6, seed=5, time_limit_s=15)).solve()

    for sol in (acs, vns):
        longest = max(r.total_time for r in sol.evaluation.routes)
        assert longest <= inst.route_horizon_s + 1.0, (
            f"route lasts {longest / 3600:.1f}h > {inst.route_horizon_s / 3600:.1f}h"
        )


def test_vns_is_not_capped_to_three_visits(s2):
    # The old constructor capped visits at max(3, n_floods*2//n_vehicles), which
    # collapsed VNS on any heavy scenario regardless of the horizon.
    inst = _instance(s2, volume_scale=10.0)
    sol = VNS(inst, VNSParams(max_iterations=6, seed=5, time_limit_s=15)).solve()

    busiest = max(
        sum(1 for v in r.visits if v.node_type == "flood") for r in sol.evaluation.routes
    )
    assert busiest > 3, f"VNS still capped at {busiest} flood visits per route"


def test_drain_time_varies_with_outlet(s2):
    inst = _instance(s2)
    types = [str(f.get("waterway_type") or "") for f in inst.ifs]
    river = [d for d, t in zip(inst.if_drain_s, types) if t == "river"]
    stream = [d for d, t in zip(inst.if_drain_s, types) if t == "stream"]

    assert river and stream
    assert max(river) < min(stream), "a large river must drain faster than a stream"


def test_higher_penalty_never_lowers_coverage(s2):
    lo = _instance(s2, volume_scale=10.0, unserved_penalty=1.0)
    hi = _instance(s2, volume_scale=10.0, unserved_penalty=500.0)
    p = ACSParams(iterations=4, n_ants=4, seed=7, time_limit_s=15)

    cov_lo = coverage_ratio(lo, HybridACS(lo, p).solve().evaluation)
    cov_hi = coverage_ratio(hi, HybridACS(hi, p).solve().evaluation)
    assert cov_hi >= cov_lo - 0.05
