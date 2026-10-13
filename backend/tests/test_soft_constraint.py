import time

import numpy as np

from app.algorithms.acs import ACSParams, HybridACS
from app.algorithms.evaluator import (
    coverage_ratio,
    evaluate_incremental,
    evaluate_solution,
)
from app.algorithms.instance import REVISIT_PENALTY, build_instance
from app.algorithms.vns import VNS, VNSParams
from app.severity.index import compute_severity_index


def _instance(b, volume_scale=1.0, unserved_penalty=500.0, revisit_penalty=REVISIT_PENALTY):
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
        revisit_penalty=revisit_penalty,
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


def test_both_solvers_close_servable_demand(s2):
    # The constructors book volume round-robin while the evaluator replays one
    # route at a time, so a few thousand litres used to be stranded that local
    # search could never pick up — it only moves existing stops.
    inst = _instance(s2, volume_scale=0.3)

    acs = HybridACS(inst, ACSParams(iterations=30, n_ants=12, seed=2, time_limit_s=30)).solve()
    vns = VNS(inst, VNSParams(max_iterations=60, seed=2, time_limit_s=30)).solve()

    for name, sol in (("ACS", acs), ("VNS", vns)):
        cov = coverage_ratio(inst, sol.evaluation)
        assert cov > 0.999, f"{name} stranded {sol.evaluation.unserved_volume:.0f} L"


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


def test_dispatch_range_is_respected_by_both_solvers(s2):
    # Half the pumping visits used to come from depots over 7 minutes away, up to
    # 27, because overflow and repair accepted any vehicle.
    inst = _instance(s2)
    nd = inst.n_depots

    acs = HybridACS(inst, ACSParams(iterations=10, n_ants=8, seed=3, time_limit_s=15)).solve()
    vns = VNS(inst, VNSParams(max_iterations=20, seed=3, time_limit_s=15)).solve()

    for name, sol in (("ACS", acs), ("VNS", vns)):
        for r in sol.evaluation.routes:
            for v in r.visits:
                if v.node_type == "flood" and v.volume_pumped > 0:
                    allowed = inst.eligible_depots[v.node_index - nd]
                    assert r.depot_index in allowed, (
                        f"{name}: depot {r.depot_index} out of range of flood {v.node_index}"
                    )


def test_every_flood_keeps_at_least_one_eligible_depot(s2):
    inst = _instance(s2)
    assert all(len(d) >= 1 for d in inst.eligible_depots)


def test_fewer_depots_are_eligible_than_exist(s2):
    inst = _instance(s2)
    used = set().union(*inst.eligible_depots)
    assert len(used) < inst.n_depots, "some depots must stay out of reach of every flood"


def test_acs_spreads_its_budget_over_many_iterations(s2):
    # Each iteration used to polish to completion, so a 45 s budget fit about six
    # iterations and pheromone learning barely started. The budget is now sliced.
    inst = _instance(s2)
    t0 = time.perf_counter()
    sol = HybridACS(inst, ACSParams(iterations=15, n_ants=10, seed=4, time_limit_s=15)).solve()
    elapsed = time.perf_counter() - t0

    assert len(sol.trace.best_score) >= 10, len(sol.trace.best_score)
    assert elapsed < 15.5, f"overran the budget: {elapsed:.1f}s"


def test_sliced_polish_does_not_leave_the_back_routes_untouched():
    import random

    from app.algorithms.local_search import _order

    firsts = {_order(24, random.Random(s))[0] for s in range(40)}
    assert len(firsts) > 12, "sweep must not always begin at the same route"
    assert _order(24, None) == list(range(24))


def test_vns_spreads_its_budget_over_many_iterations(s2):
    # One round used to polish the greedy start to completion (about 18 s per
    # polish), so a 45 s budget fitted two rounds and the search barely began.
    inst = _instance(s2)
    t0 = time.perf_counter()
    sol = VNS(inst, VNSParams(max_iterations=15, seed=4, time_limit_s=15)).solve()
    elapsed = time.perf_counter() - t0

    # An iteration's length varies with the random start (the same seed has given
    # 8 and 14 in one session), so this only guards the old failure of about two.
    assert len(sol.trace.best_score) >= 6, len(sol.trace.best_score)
    assert elapsed < 15.5, f"overran the budget: {elapsed:.1f}s"


def _split_visit_route(inst):
    """One 3000 L route that pumps the same flood twice, with an outlet between.

    The flood is given 4000 L, so the 5000 L tank (Q_max) could empty it in one
    visit: ceil(4000 / 5000) = 1, and the second visit is one excess visit.
    """
    flood = inst.flood_indices[0]
    slot = flood - inst.n_depots
    depot = next(iter(inst.eligible_depots[slot]))
    outlet = inst.if_indices[0]
    inst.volumes[slot] = 4000.0
    route = [depot, outlet, flood, outlet, flood, depot]
    return route, slot


def test_revisit_penalty_is_off_by_default(s2):
    assert REVISIT_PENALTY == 0.0
    inst = _instance(s2)
    route, _ = _split_visit_route(inst)
    ev = evaluate_solution(inst, [route], [3000])

    assert ev.excess_visits == 1, "the split visit is still counted"
    assert inst.revisit_penalty == 0.0
    plain = _instance(s2, revisit_penalty=0.0)
    _split_visit_route(plain)
    assert ev.penalty == evaluate_solution(plain, [route], [3000]).penalty


def test_excess_visits_counts_beyond_the_minimum(s2):
    inst = _instance(s2)
    route, slot = _split_visit_route(inst)
    ev = evaluate_solution(inst, [route], [3000])

    pumping = [v for v in ev.routes[0].visits if v.node_type == "flood" and v.volume_pumped > 0]
    assert len(pumping) == 2
    assert inst.min_visits()[slot] == 1
    assert ev.excess_visits == 1

    # One visit with the big tank empties it: nothing in excess.
    single = [route[0], route[1], route[2], route[0]]
    assert evaluate_solution(inst, [single], [5000]).excess_visits == 0


def test_idle_stops_are_not_counted_as_visits(s2):
    inst = _instance(s2)
    route, _ = _split_visit_route(inst)
    # The second stop arrives with a full 5000 L tank already holding the whole
    # 4000 L, so the flood is drained and the stop pumps nothing.
    full_tank = [route[0], route[1], route[2], route[2], route[0]]
    ev = evaluate_solution(inst, [full_tank], [5000])
    assert ev.excess_visits == 0


def test_revisit_penalty_is_added_to_the_score(s2):
    weight = 1500.0
    off = _instance(s2, revisit_penalty=0.0)
    on = _instance(s2, revisit_penalty=weight)
    route, _ = _split_visit_route(off)
    _split_visit_route(on)

    ev_off = evaluate_solution(off, [route], [3000])
    ev_on = evaluate_solution(on, [route], [3000])

    assert ev_on.excess_visits == ev_off.excess_visits == 1
    assert ev_on.objective_z == ev_off.objective_z, "P2 never touches Z"
    assert ev_on.penalty - ev_off.penalty == weight * 1
    assert ev_on.score == ev_on.objective_z + ev_on.penalty


def test_incremental_evaluation_carries_the_revisit_penalty(s2):
    inst = _instance(s2, revisit_penalty=800.0)
    solver = HybridACS(inst, ACSParams(iterations=2, n_ants=2, seed=1, time_limit_s=5))
    routes, caps = solver._construct_one_ant()
    base = evaluate_solution(inst, routes, caps)

    # Reverse a stretch of each route in turn; the incremental pass must agree.
    for k, r in enumerate(routes):
        if len(r) <= 4:
            continue
        trial = [list(x) for x in routes]
        trial[k][1:-1] = reversed(trial[k][1:-1])
        full = evaluate_solution(inst, trial, caps)
        inc = evaluate_incremental(inst, trial, caps, base, k)
        assert inc.excess_visits == full.excess_visits
        assert inc.penalty == full.penalty
        assert inc.score == full.score


def test_revisit_penalty_never_raises_excess_visits(s2):
    p = ACSParams(iterations=6, n_ants=6, seed=11, time_limit_s=15)
    off = _instance(s2, revisit_penalty=0.0)
    on = _instance(s2, revisit_penalty=5000.0)

    excess_off = HybridACS(off, p).solve().evaluation.excess_visits
    excess_on = HybridACS(on, p).solve().evaluation.excess_visits
    assert excess_on <= excess_off + 2
