"""Lightweight local search operators for post-processing an ACS solution.

Each function accepts an in-progress ``list[list[int]]`` routes structure
plus the ``Instance`` and returns an improved copy (or the input unchanged).
Feasibility is re-checked via ``evaluate_solution``.
"""

from __future__ import annotations

import copy

from app.algorithms.evaluator import (
    SolutionEval,
    all_floods_served,
    evaluate_solution,
)
from app.algorithms.instance import Instance


def two_opt(
    inst: Instance,
    routes: list[list[int]],
    capacities: list[int],
    current_z: float,
) -> tuple[list[list[int]], float]:
    """Intra-route 2-opt: reverse each segment [i, j] and keep improving ones."""
    best_routes = [list(r) for r in routes]
    best_z = current_z
    for ri, route in enumerate(best_routes):
        if len(route) <= 3:
            continue
        improved = True
        while improved:
            improved = False
            for i in range(1, len(route) - 2):
                for j in range(i + 1, len(route) - 1):
                    candidate = list(route)
                    candidate[i : j + 1] = reversed(candidate[i : j + 1])
                    trial = [list(x) for x in best_routes]
                    trial[ri] = candidate
                    ev = evaluate_solution(inst, trial, capacities)
                    if (
                        all_floods_served(ev.remaining_volume)
                        and ev.objective_z + 1e-9 < best_z
                    ):
                        best_routes = trial
                        route = candidate
                        best_z = ev.objective_z
                        improved = True
                        break
                if improved:
                    break
    return best_routes, best_z


def relocate_between_routes(
    inst: Instance,
    routes: list[list[int]],
    capacities: list[int],
    current_z: float,
) -> tuple[list[list[int]], float]:
    """Move a single flood-point visit from route A into a slot in route B."""
    best_routes = [list(r) for r in routes]
    best_z = current_z
    n_routes = len(best_routes)
    for a in range(n_routes):
        # Iterate over internal flood-visit positions in route a.
        for i in range(1, len(best_routes[a]) - 1):
            node = best_routes[a][i]
            if node < inst.n_depots or node >= inst.n_depots + inst.n_floods:
                continue
            for b in range(n_routes):
                if a == b:
                    continue
                for j in range(1, len(best_routes[b])):
                    trial = copy.deepcopy(best_routes)
                    moved = trial[a].pop(i)
                    trial[b].insert(j, moved)
                    ev = evaluate_solution(inst, trial, capacities)
                    if (
                        all_floods_served(ev.remaining_volume)
                        and ev.objective_z + 1e-9 < best_z
                    ):
                        best_routes = trial
                        best_z = ev.objective_z
                        return best_routes, best_z  # first-improvement
    return best_routes, best_z


def polish(
    inst: Instance,
    routes: list[list[int]],
    capacities: list[int],
    current_z: float,
    max_rounds: int = 2,
) -> tuple[list[list[int]], float, SolutionEval]:
    """Run 2-opt then relocate a few rounds until no further improvement."""
    cur_routes = [list(r) for r in routes]
    cur_z = current_z
    for _ in range(max_rounds):
        cur_routes, new_z = two_opt(inst, cur_routes, capacities, cur_z)
        if new_z >= cur_z:
            break
        cur_z = new_z
    cur_routes, new_z = relocate_between_routes(inst, cur_routes, capacities, cur_z)
    cur_z = new_z
    ev = evaluate_solution(inst, cur_routes, capacities)
    return cur_routes, cur_z, ev
