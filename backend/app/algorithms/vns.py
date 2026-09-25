# VNS baseline for MDCVRP-IF-SI (comparison algorithm)
# GVNS: greedy init, shaking (k perturbations), local search, accept-or-increment-k

from __future__ import annotations

import copy
import random
import time
from dataclasses import dataclass, field

import numpy as np

from app.algorithms.evaluator import (
    SolutionEval,
    all_floods_served,
    evaluate_solution,
)
from app.algorithms.instance import Instance
from app.algorithms.local_search import polish


@dataclass
class VNSParams:
    max_iterations: int = 100
    k_max: int = 3
    seed: int | None = None
    time_limit_s: float | None = 45.0


@dataclass
class VNSTrace:
    best_z: list[float] = field(default_factory=list)
    iter_best_z: list[float] = field(default_factory=list)


@dataclass
class VNSSolution:
    routes: list[list[int]]
    capacities: list[int]
    evaluation: SolutionEval
    trace: VNSTrace
    computation_time_s: float


class VNS:
    def __init__(self, instance: Instance, params: VNSParams):
        self.inst = instance
        self.p = params
        self._rng = random.Random(params.seed)
        self._np_rng = np.random.default_rng(params.seed)

        self._flood_set = set(instance.flood_indices)
        self._flood_lookup: dict[int, int] = {
            fi: k for k, fi in enumerate(instance.flood_indices)
        }

    def _greedy_initial(
        self, deadline: float | None = None
    ) -> tuple[list[list[int]], list[int]]:
        # Nearest-neighbor + SI bias; tries multiple orderings with repair phase.
        # Full coverage ends the search early, otherwise keep the best partial.
        max_attempts = 20
        best_effort: tuple[list[list[int]], list[int]] | None = None
        best_effort_score = float("inf")
        for _attempt in range(max_attempts):
            if best_effort is not None and deadline is not None:
                if time.perf_counter() >= deadline:
                    break
            volumes_left = self.inst.volumes.copy()
            n_vehicles = len(self.inst.vehicles)

            order = list(range(n_vehicles))
            self._rng.shuffle(order)

            route_map: dict[int, list[int]] = {}
            cap_map: dict[int, int] = {}

            for vi in order:
                depot, cap = self.inst.vehicles[vi]
                if np.all(volumes_left <= 0.5):
                    route_map[vi] = [depot, depot]
                    cap_map[vi] = cap
                    continue
                route, _ = self._build_greedy_route(depot, cap, volumes_left)
                route_map[vi] = route
                cap_map[vi] = cap

            # Overflow: if own-depot constraint left unserved floods, allow any
            # Only use vehicles with empty routes to avoid discarding existing visits
            if np.any(volumes_left > 0.5):
                for vi in order:
                    if np.all(volumes_left <= 0.5):
                        break
                    if len(route_map.get(vi, [])) > 2:
                        continue
                    depot, cap = self.inst.vehicles[vi]
                    route, _ = self._build_greedy_route(
                        depot, cap, volumes_left, allow_all=True,
                    )
                    if len(route) > 2:
                        route_map[vi] = route
                        cap_map[vi] = cap

            routes = [route_map[i] for i in range(n_vehicles)]
            capacities = [cap_map[i] for i in range(n_vehicles)]

            for _repair_round in range(self.inst.n_floods * 3):
                ev = evaluate_solution(self.inst, routes, capacities)
                if all_floods_served(ev.remaining_volume):
                    return routes, capacities
                self._repair_one(routes, capacities, ev.remaining_volume)

            ev = evaluate_solution(self.inst, routes, capacities)
            if all_floods_served(ev.remaining_volume):
                return routes, capacities
            if best_effort is None or ev.score < best_effort_score:
                best_effort = ([list(r) for r in routes], list(capacities))
                best_effort_score = ev.score

        if best_effort is None:
            raise RuntimeError("VNS did not construct any initial solution.")
        return best_effort

    def _build_greedy_route(
        self,
        depot: int,
        cap: int,
        volumes_left: np.ndarray,
        allow_all: bool = False,
    ) -> tuple[list[int], float]:
        route: list[int] = [depot]
        tank = float(cap)  # standby full: force an IF stop before pumping
        current = depot
        flood_visits = 0
        max_flood_visits = max(
            3, (self.inst.n_floods * 2) // max(len(self.inst.vehicles), 1) + 1
        )
        max_steps = self.inst.n_floods * 2 + self.inst.n_ifs + 5
        own_floods = self.inst.depot_flood_sets.get(depot, set())

        for _ in range(max_steps):
            if allow_all:
                served = [
                    fi for k, fi in enumerate(self.inst.flood_indices)
                    if volumes_left[k] > 0.5
                ]
            else:
                served = [
                    fi for fi in own_floods
                    if volumes_left[self._flood_lookup[fi]] > 0.5
                ]
            if not served or flood_visits >= max_flood_visits:
                break

            if tank >= cap - 1e-3:
                nearest_if = self._nearest(current, self.inst.if_indices)
                route.append(nearest_if)
                tank = 0.0
                current = nearest_if
                continue

            nxt = self._greedy_next(current, served)
            flood_slot = self._flood_lookup[nxt]
            free = cap - tank
            pump = min(volumes_left[flood_slot], free)
            volumes_left[flood_slot] -= pump
            tank += pump
            route.append(nxt)
            flood_visits += 1
            current = nxt

        route.append(depot)
        return route, tank

    def _greedy_next(
        self,
        current: int,
        candidates: list[int],
    ) -> int:
        slots = [self._flood_lookup[c] for c in candidates]
        dists = self.inst.dist_matrix[current, candidates]
        si = self.inst.si_values[slots]
        with np.errstate(divide="ignore", invalid="ignore"):
            scores = si / np.where(dists < 1e-6, 1e-6, dists)
        noise = self._np_rng.uniform(0.8, 1.2, size=len(scores))
        scores = scores * noise
        return int(candidates[int(np.argmax(scores))])

    def _repair_one(
        self,
        routes: list[list[int]],
        capacities: list[int],
        remaining_volume: np.ndarray,
    ) -> None:
        unserved = [
            (k, fi)
            for k, fi in enumerate(self.inst.flood_indices)
            if remaining_volume[k] > 0.5
        ]
        if not unserved:
            return

        flood_slot, flood_node = unserved[0]
        assigned_depot = int(self.inst.nearest_depot[flood_slot])

        # Prefer vehicles from flood's assigned depot, fall back to nearest any
        best_vi = -1
        best_dist = float("inf")
        for vi in range(len(routes)):
            depot_of_vehicle = routes[vi][0]
            if depot_of_vehicle != assigned_depot:
                continue
            last_stop = routes[vi][-2] if len(routes[vi]) >= 2 else routes[vi][0]
            d = float(self.inst.dist_matrix[last_stop, flood_node])
            if d < best_dist:
                best_dist = d
                best_vi = vi

        if best_vi < 0:
            for vi in range(len(routes)):
                last_stop = routes[vi][-2] if len(routes[vi]) >= 2 else routes[vi][0]
                d = float(self.inst.dist_matrix[last_stop, flood_node])
                if d < best_dist:
                    best_dist = d
                    best_vi = vi

        if best_vi < 0:
            return

        route = routes[best_vi]
        nearest_if = self._nearest(flood_node, self.inst.if_indices)
        depot = route[-1]
        route.pop()
        route.append(nearest_if)
        route.append(flood_node)
        route.append(depot)

    def _nearest(self, i: int, pool: list[int]) -> int:
        d = self.inst.dist_matrix[i, pool]
        return int(pool[int(np.argmin(d))])

    # ---- Shaking (neighborhood perturbations) ----

    def _shake(
        self,
        routes: list[list[int]],
        capacities: list[int],
        k: int,
    ) -> list[list[int]]:
        shaken = [list(r) for r in routes]
        for _ in range(k):
            move = self._rng.randint(0, 2)
            if move == 0:
                self._shake_swap_within(shaken)
            elif move == 1:
                self._shake_relocate_between(shaken)
            else:
                self._shake_reverse_segment(shaken)
        return shaken

    def _active_routes(self, routes: list[list[int]]) -> list[int]:
        return [
            ri for ri, r in enumerate(routes)
            if any(n in self._flood_set for n in r[1:-1])
        ]

    def _shake_swap_within(self, routes: list[list[int]]) -> None:
        active = self._active_routes(routes)
        if not active:
            return
        ri = self._rng.choice(active)
        r = routes[ri]
        internal = list(range(1, len(r) - 1))
        if len(internal) < 2:
            return
        a, b = self._rng.sample(internal, 2)
        r[a], r[b] = r[b], r[a]

    def _shake_relocate_between(self, routes: list[list[int]]) -> None:
        active = self._active_routes(routes)
        if len(active) < 2:
            return
        src_ri = self._rng.choice(active)
        src = routes[src_ri]
        flood_positions = [
            i for i in range(1, len(src) - 1) if src[i] in self._flood_set
        ]
        if not flood_positions:
            return
        pos = self._rng.choice(flood_positions)
        node = src[pos]

        flood_slot = node - self.inst.n_depots
        assigned_depot = int(self.inst.nearest_depot[flood_slot])
        eligible = [
            r for r in active
            if r != src_ri and routes[r][0] == assigned_depot
        ]
        if not eligible:
            eligible = [r for r in active if r != src_ri]
        if not eligible:
            return

        src.pop(pos)
        dst_ri = self._rng.choice(eligible)
        dst = routes[dst_ri]
        insert_pos = self._rng.randint(1, max(1, len(dst) - 1))
        dst.insert(insert_pos, node)

    def _shake_reverse_segment(self, routes: list[list[int]]) -> None:
        active = self._active_routes(routes)
        if not active:
            return
        ri = self._rng.choice(active)
        r = routes[ri]
        if len(r) <= 3:
            return
        a = self._rng.randint(1, len(r) - 3)
        b = self._rng.randint(a + 1, len(r) - 2)
        r[a:b + 1] = reversed(r[a:b + 1])

    # ---- Main VNS loop ----

    def solve(self) -> VNSSolution:
        start = time.perf_counter()
        deadline = (
            start + self.p.time_limit_s if self.p.time_limit_s is not None else None
        )

        routes, capacities = self._greedy_initial(deadline)
        ev = evaluate_solution(self.inst, routes, capacities)

        best_routes = [list(r) for r in routes]
        best_caps = list(capacities)
        best_score = ev.score
        best_eval = ev
        trace = VNSTrace()

        for it in range(self.p.max_iterations):
            k = 1
            iter_score = best_score

            while k <= self.p.k_max:
                shaken = self._shake(best_routes, best_caps, k)

                try:
                    # Evaluate shaken first so polish has a real baseline —
                    # float("inf") baseline accepts every feasible candidate
                    # and thrashes with scan restarts.
                    shaken_ev = evaluate_solution(self.inst, shaken, best_caps)
                    polished, pol_score, pol_ev = polish(
                        self.inst, shaken, best_caps, shaken_ev.score,
                        max_rounds=2, quick=True, deadline=deadline,
                    )
                except Exception:
                    k += 1
                    continue

                if pol_score + 1e-9 < best_score:
                    best_score = pol_score
                    best_routes = [list(r) for r in polished]
                    best_eval = pol_ev
                    iter_score = pol_score
                    k = 1
                else:
                    k += 1

                if (
                    self.p.time_limit_s is not None
                    and time.perf_counter() - start > self.p.time_limit_s
                ):
                    break

            trace.iter_best_z.append(float(iter_score))
            trace.best_z.append(float(best_score))

            if (
                self.p.time_limit_s is not None
                and time.perf_counter() - start > self.p.time_limit_s
            ):
                break

        elapsed = time.perf_counter() - start
        return VNSSolution(
            routes=best_routes,
            capacities=best_caps,
            evaluation=best_eval,
            trace=trace,
            computation_time_s=elapsed,
        )
