import numpy as np

from app.algorithms.acs import ACSParams, HybridACS
from app.algorithms.evaluator import coverage_ratio, evaluate_solution
from app.algorithms.instance import build_instance
from app.algorithms.vns import VNS, VNSParams
from app.severity.index import compute_severity_index


def _instance(b, volume_per_cm=100.0, unserved_penalty=100.0):
    sev = compute_severity_index(b.floods, b.faskes)
    return build_instance(
        depots_df=b.depots,
        floods_df=b.floods,
        ifs_df=b.ifs,
        dist_matrix=b.distance_matrix,
        time_matrix=b.time_matrix,
        si_values=sev.si_values,
        volume_per_cm=volume_per_cm,
        unserved_penalty=unserved_penalty,
    )


def test_idle_solution_is_penalised_not_rejected(s2):
    inst = _instance(s2)
    idle = [[d, d] for d in inst.depot_indices]
    ev = evaluate_solution(inst, idle, [5000] * len(idle))

    assert ev.objective_z == 0.0, "nothing served means no arrival-time cost"
    assert ev.penalty > 0, "but the undone work must carry a cost"
    assert ev.score == ev.objective_z + ev.penalty
    assert coverage_ratio(inst, ev) == 0.0


def test_full_coverage_has_no_penalty(s2):
    inst = _instance(s2)
    sol = HybridACS(inst, ACSParams(iterations=6, n_ants=6, seed=1, time_limit_s=15)).solve()
    ev = sol.evaluation
    if ev.unserved_volume <= 1.0:
        assert ev.penalty == 0.0
        assert ev.score == ev.objective_z
        assert coverage_ratio(inst, ev) == 1.0


def test_solvers_survive_undeliverable_demand(s2):
    # 40x the demand cannot fit the fleet inside the time cap. Under the old
    # hard constraint both solvers raised; now they must return a partial plan.
    inst = _instance(s2, volume_per_cm=4000.0)

    acs = HybridACS(inst, ACSParams(iterations=4, n_ants=4, seed=1, time_limit_s=15)).solve()
    vns = VNS(inst, VNSParams(max_iterations=6, seed=1, time_limit_s=15)).solve()

    for sol in (acs, vns):
        ev = sol.evaluation
        assert np.isfinite(ev.score)
        assert ev.unserved_volume > 0, "this instance cannot be fully served"
        assert 0.0 <= coverage_ratio(inst, ev) < 1.0


def test_higher_penalty_never_lowers_coverage(s2):
    lo = _instance(s2, volume_per_cm=4000.0, unserved_penalty=1.0)
    hi = _instance(s2, volume_per_cm=4000.0, unserved_penalty=500.0)
    p = ACSParams(iterations=4, n_ants=4, seed=7, time_limit_s=15)

    cov_lo = coverage_ratio(lo, HybridACS(lo, p).solve().evaluation)
    cov_hi = coverage_ratio(hi, HybridACS(hi, p).solve().evaluation)
    assert cov_hi >= cov_lo - 0.05
