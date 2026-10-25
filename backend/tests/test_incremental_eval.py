import random

import numpy as np

from app.algorithms.acs import ACSParams, HybridACS
from app.algorithms.evaluator import evaluate_incremental, evaluate_solution
from app.algorithms.instance import build_instance
from app.severity.index import compute_severity_index

FIELDS = [
    "objective_z",
    "total_distance",
    "total_time",
    "total_if_visits",
    "total_flood_visits",
    "unserved_volume",
    "overtime_s",
    "penalty",
    "score",
]


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


def _a_solution(inst):
    solver = HybridACS(inst, ACSParams(iterations=2, n_ants=2, seed=1, time_limit_s=5))
    return solver._construct_one_ant()


def test_incremental_matches_full_evaluation(s2):
    # Local search reuses routes the move cannot have touched. If that shortcut
    # ever disagrees with a full pass, every score the solvers rank on is wrong.
    inst = _instance(s2)
    routes, caps = _a_solution(inst)
    base = evaluate_solution(inst, routes, caps)
    rng = random.Random(0)

    for _ in range(60):
        trial = [list(r) for r in routes]
        k = rng.randrange(len(trial))
        if len(trial[k]) <= 4:
            continue
        a = rng.randrange(1, len(trial[k]) - 2)
        b = rng.randrange(a + 1, len(trial[k]) - 1)
        trial[k][a : b + 1] = reversed(trial[k][a : b + 1])

        full = evaluate_solution(inst, trial, caps)
        inc = evaluate_incremental(inst, trial, caps, base, k)

        for f in FIELDS:
            assert getattr(full, f) == getattr(inc, f), f
        assert np.array_equal(full.remaining_volume, inc.remaining_volume)


def test_incremental_falls_back_when_the_first_route_changed(s2):
    inst = _instance(s2)
    routes, caps = _a_solution(inst)
    base = evaluate_solution(inst, routes, caps)

    inc = evaluate_incremental(inst, routes, caps, base, 0)
    assert inc.score == base.score


def test_incremental_matches_full_evaluation_when_two_routes_change(s2):
    # Relocate, or-opt and exchange change two routes at once. The volume-match
    # shortcut must never reuse the stale evaluation of the second one: a stop
    # moved into a later route changes that route's time (and its overtime)
    # even when the volume entering it is the same as before.
    inst = _instance(s2)
    routes, caps = _a_solution(inst)
    base = evaluate_solution(inst, routes, caps)
    rng = random.Random(1)
    flood = set(inst.flood_indices)
    checked = 0

    for _ in range(400):
        a, b = sorted(rng.sample(range(len(routes)), 2))
        src = [i for i, n in enumerate(routes[a][1:-1], start=1) if n in flood]
        if not src or len(routes[b]) < 2:
            continue
        i = rng.choice(src)
        j = rng.randrange(1, len(routes[b]))
        trial = [list(r) for r in routes]
        node = trial[a].pop(i)
        trial[b].insert(j, node)

        full = evaluate_solution(inst, trial, caps)
        inc = evaluate_incremental(inst, trial, caps, base, a, last_changed=b)
        for f in FIELDS:
            assert getattr(full, f) == getattr(inc, f), f
        checked += 1

    assert checked > 50
