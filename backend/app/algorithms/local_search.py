# Local search operators: 2-opt, relocate, or-opt, swap, composite

from __future__ import annotations

import copy
import time

from app.algorithms.evaluator import (
    SolutionEval,
    evaluate_solution,
)
from app.algorithms.instance import Instance


def _is_flood(inst: Instance, node: int) -> bool:
    return inst.n_depots <= node < inst.n_depots + inst.n_floods


def _expired(deadline: float | None) -> bool:
    # Operators scan O(n^2) neighbourhoods and one evaluation grows with route
    # length, so a pass can outlive the solver's budget. Checked inside the
    # scans, not just between them.
    return deadline is not None and time.perf_counter() >= deadline


def two_opt(
    inst: Instance,
    routes: list[list[int]],
    capacities: list[int],
    current_score: float,
    max_passes: int = 5,
    deadline: float | None = None,
) -> tuple[list[list[int]], float]:
    best_routes = [list(r) for r in routes]
    best_score = current_score
    for ri, route in enumerate(best_routes):
        if len(route) <= 3:
            continue
        for _pass in range(max_passes):
            improved = False
            for i in range(1, len(route) - 2):
                if _expired(deadline):
                    return best_routes, best_score
                near = inst.neighbor_sets[route[i]]
                for j in range(i + 1, len(route) - 1):
                    if route[j] not in near:
                        continue
                    candidate = list(route)
                    candidate[i : j + 1] = reversed(candidate[i : j + 1])
                    trial = [list(x) for x in best_routes]
                    trial[ri] = candidate
                    ev = evaluate_solution(inst, trial, capacities)
                    if ev.score + 1e-9 < best_score:
                        best_routes = trial
                        route = candidate
                        best_score = ev.score
                        improved = True
                        break
                if improved:
                    break
            if not improved:
                break
    return best_routes, best_score


def relocate_between_routes(
    inst: Instance,
    routes: list[list[int]],
    capacities: list[int],
    current_score: float,
    deadline: float | None = None,
) -> tuple[list[list[int]], float]:
    best_routes = [list(r) for r in routes]
    best_score = current_score
    n_routes = len(best_routes)
    for a in range(n_routes):
        if _expired(deadline):
            break
        for i in range(1, len(best_routes[a]) - 1):
            node = best_routes[a][i]
            if not _is_flood(inst, node):
                continue
            flood_slot = node - inst.n_depots
            assigned_depot = int(inst.nearest_depot[flood_slot])
            for b in range(n_routes):
                if a == b:
                    continue
                # Hard constraint: only relocate to route from flood's assigned depot
                if best_routes[b][0] != assigned_depot:
                    continue
                if _expired(deadline):
                    return best_routes, best_score
                near = inst.neighbor_sets[node]
                for j in range(1, len(best_routes[b])):
                    if (
                        best_routes[b][j - 1] not in near
                        and best_routes[b][j] not in near
                    ):
                        continue
                    trial = list(best_routes)
                    trial[a] = best_routes[a][:i] + best_routes[a][i + 1 :]
                    trial[b] = best_routes[b][:j] + [node] + best_routes[b][j:]
                    ev = evaluate_solution(inst, trial, capacities)
                    if ev.score + 1e-9 < best_score:
                        best_routes = trial
                        best_score = ev.score
                        return best_routes, best_score
    return best_routes, best_score


def or_opt(
    inst: Instance,
    routes: list[list[int]],
    capacities: list[int],
    current_score: float,
    max_seg_len: int = 2,
    max_passes: int = 3,
    deadline: float | None = None,
) -> tuple[list[list[int]], float]:
    best_routes = [list(r) for r in routes]
    best_score = current_score
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
                        if _expired(deadline):
                            return best_routes, best_score
                        dst_depot = best_routes[b][0]
                        if not all(
                            int(inst.nearest_depot[n - inst.n_depots]) == dst_depot
                            for n in seg
                        ):
                            continue
                        near = inst.neighbor_sets[seg[0]]
                        for j in range(1, len(best_routes[b])):
                            if (
                                best_routes[b][j - 1] not in near
                                and best_routes[b][j] not in near
                            ):
                                continue
                            trial = [list(r) for r in best_routes]
                            trial[a] = trial[a][:i] + trial[a][i + seg_len :]
                            trial[b] = trial[b][:j] + seg + trial[b][j:]
                            ev = evaluate_solution(inst, trial, capacities)
                            if ev.score + 1e-9 < best_score:
                                best_routes = trial
                                best_score = ev.score
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
    return best_routes, best_score


def exchange(
    inst: Instance,
    routes: list[list[int]],
    capacities: list[int],
    current_score: float,
    deadline: float | None = None,
) -> tuple[list[list[int]], float]:
    best_routes = [list(r) for r in routes]
    best_score = current_score
    n_routes = len(best_routes)
    for a in range(n_routes):
        if _expired(deadline):
            break
        depot_a = best_routes[a][0]
        for i in range(1, len(best_routes[a]) - 1):
            node_a = best_routes[a][i]
            if not _is_flood(inst, node_a):
                continue
            for b in range(a + 1, n_routes):
                if _expired(deadline):
                    return best_routes, best_score
                depot_b = best_routes[b][0]
                for j in range(1, len(best_routes[b]) - 1):
                    node_b = best_routes[b][j]
                    if not _is_flood(inst, node_b):
                        continue
                    if node_b not in inst.neighbor_sets[node_a]:
                        continue
                    # Only swap if both floods are compatible with destination depot
                    if int(inst.nearest_depot[node_a - inst.n_depots]) != depot_b:
                        continue
                    if int(inst.nearest_depot[node_b - inst.n_depots]) != depot_a:
                        continue
                    trial = [list(r) for r in best_routes]
                    trial[a][i], trial[b][j] = trial[b][j], trial[a][i]
                    ev = evaluate_solution(inst, trial, capacities)
                    if ev.score + 1e-9 < best_score:
                        best_routes = trial
                        best_score = ev.score
                        return best_routes, best_score
    return best_routes, best_score


def polish(
    inst: Instance,
    routes: list[list[int]],
    capacities: list[int],
    current_score: float,
    max_rounds: int = 5,
    quick: bool = False,
    deadline: float | None = None,
) -> tuple[list[list[int]], float, SolutionEval]:
    # quick=True: only 2-opt + relocate; quick=False: all four operators
    cur_routes = [list(r) for r in routes]
    cur_score = current_score
    for _ in range(max_rounds):
        prev_score = cur_score
        cur_routes, cur_score = two_opt(
            inst, cur_routes, capacities, cur_score, deadline=deadline
        )
        cur_routes, cur_score = relocate_between_routes(
            inst, cur_routes, capacities, cur_score, deadline=deadline
        )
        if not quick:
            cur_routes, cur_score = or_opt(
                inst, cur_routes, capacities, cur_score, deadline=deadline
            )
            cur_routes, cur_score = exchange(
                inst, cur_routes, capacities, cur_score, deadline=deadline
            )
        if _expired(deadline) or cur_score >= prev_score - 1e-9:
            break
    ev = evaluate_solution(inst, cur_routes, capacities)
    return cur_routes, cur_score, ev
