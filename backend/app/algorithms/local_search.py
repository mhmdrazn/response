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


def _is_flood(inst: Instance, node: int) -> bool:
    return inst.n_depots <= node < inst.n_depots + inst.n_floods


def two_opt(
    inst: Instance,
    routes: list[list[int]],
    capacities: list[int],
    current_z: float,
    max_passes: int = 5,
) -> tuple[list[list[int]], float]:
    """Intra-route 2-opt: reverse each segment [i, j] and keep improving ones."""
    best_routes = [list(r) for r in routes]
    best_z = current_z
    for ri, route in enumerate(best_routes):
        if len(route) <= 3:
            continue
        for _pass in range(max_passes):
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
            if not improved:
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
        for i in range(1, len(best_routes[a]) - 1):
            node = best_routes[a][i]
            if node < inst.n_depots or node >= inst.n_depots + inst.n_floods:
                continue
            for b in range(n_routes):
                if a == b:
                    continue
                for j in range(1, len(best_routes[b])):
                    # Shallow-copy the routes list, then only clone the two
                    # routes we mutate — avoids deepcopy of 24 routes per
                    # candidate (was ~1ms × thousands of trials = seconds).
                    trial = list(best_routes)
                    trial[a] = best_routes[a][:i] + best_routes[a][i + 1 :]
                    trial[b] = best_routes[b][:j] + [node] + best_routes[b][j:]
                    ev = evaluate_solution(inst, trial, capacities)
                    if (
                        all_floods_served(ev.remaining_volume)
                        and ev.objective_z + 1e-9 < best_z
                    ):
                        best_routes = trial
                        best_z = ev.objective_z
                        return best_routes, best_z  # first-improvement
    return best_routes, best_z


def or_opt(
    inst: Instance,
    routes: list[list[int]],
    capacities: list[int],
    current_z: float,
    max_seg_len: int = 2,
    max_passes: int = 3,
) -> tuple[list[list[int]], float]:
    """Move a segment of 1–``max_seg_len`` consecutive flood nodes between routes.

    Or-opt complements relocate (single node) by allowing chains of nearby
    high-SI floods to migrate together to a shorter/faster route.
    Capped by ``max_passes`` per segment length to keep runtime predictable.
    """
    best_routes = [list(r) for r in routes]
    best_z = current_z
    for seg_len in range(1, max_seg_len + 1):
        for _pass in range(max_passes):
            improved = False
            for a in range(len(best_routes)):
                if len(best_routes[a]) < 2 + seg_len:
                    continue
                for i in range(1, len(best_routes[a]) - seg_len):
                    seg = best_routes[a][i : i + seg_len]
                    if not all(_is_flood(inst, n) for n in seg):
                        continue
                    for b in range(len(best_routes)):
                        if a == b:
                            continue
                        for j in range(1, len(best_routes[b])):
                            trial = [list(r) for r in best_routes]
                            trial[a] = trial[a][:i] + trial[a][i + seg_len :]
                            trial[b] = trial[b][:j] + seg + trial[b][j:]
                            ev = evaluate_solution(inst, trial, capacities)
                            if (
                                all_floods_served(ev.remaining_volume)
                                and ev.objective_z + 1e-9 < best_z
                            ):
                                best_routes = trial
                                best_z = ev.objective_z
                                improved = True
                                break
                        if improved:
                            break
                    if improved:
                        break
                if improved:
                    break
            if not improved:
                break
    return best_routes, best_z


def exchange(
    inst: Instance,
    routes: list[list[int]],
    capacities: list[int],
    current_z: float,
) -> tuple[list[list[int]], float]:
    """Swap one flood visit from route A with one flood visit from route B.

    Useful when two routes carry each other's better-suited floods
    (high-SI floods stuck in a long route, low-SI stuck in a short one).
    """
    best_routes = [list(r) for r in routes]
    best_z = current_z
    n_routes = len(best_routes)
    for a in range(n_routes):
        for i in range(1, len(best_routes[a]) - 1):
            if not _is_flood(inst, best_routes[a][i]):
                continue
            for b in range(a + 1, n_routes):
                for j in range(1, len(best_routes[b]) - 1):
                    if not _is_flood(inst, best_routes[b][j]):
                        continue
                    trial = [list(r) for r in best_routes]
                    trial[a][i], trial[b][j] = trial[b][j], trial[a][i]
                    ev = evaluate_solution(inst, trial, capacities)
                    if (
                        all_floods_served(ev.remaining_volume)
                        and ev.objective_z + 1e-9 < best_z
                    ):
                        best_routes = trial
                        best_z = ev.objective_z
                        return best_routes, best_z  # first improvement
    return best_routes, best_z


def polish(
    inst: Instance,
    routes: list[list[int]],
    capacities: list[int],
    current_z: float,
    max_rounds: int = 5,
    quick: bool = False,
) -> tuple[list[list[int]], float, SolutionEval]:
    """Cycle local-search operators until no Z improvement or ``max_rounds``.

    ``quick=True`` skips the expensive or-opt and exchange operators — use it
    for per-iteration polish where budget is tight. ``quick=False`` runs all
    four operators — use it periodically or for final intensive polish.
    """
    cur_routes = [list(r) for r in routes]
    cur_z = current_z
    for _ in range(max_rounds):
        prev_z = cur_z
        cur_routes, cur_z = two_opt(inst, cur_routes, capacities, cur_z)
        cur_routes, cur_z = relocate_between_routes(inst, cur_routes, capacities, cur_z)
        if not quick:
            cur_routes, cur_z = or_opt(inst, cur_routes, capacities, cur_z)
            cur_routes, cur_z = exchange(inst, cur_routes, capacities, cur_z)
        if cur_z >= prev_z - 1e-9:
            break
    ev = evaluate_solution(inst, cur_routes, capacities)
    return cur_routes, cur_z, ev
