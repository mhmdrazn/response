"""Variable Neighborhood Search (VNS) baseline for MDCVRP-IF-SI.

Used as the comparison algorithm against Hybrid ACS in the thesis.
The solver follows the General VNS (GVNS) framework:

    1. Construct an initial solution via a greedy nearest-neighbor heuristic
       that prioritises high-SI, nearby flood points.
    2. For k = 1 .. k_max:
       a. Shaking — apply k random perturbations to the current solution.
       b. Local search — polish the shaken solution with 2-opt + relocate.
       c. Move or not — if the polished solution improves Z, accept it
          and reset k = 1; otherwise k += 1.
    3. Repeat until max_iterations or time_limit_s is reached.
"""

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
    # Multiplier on the SI/d score for a flood whose nearest depot equals
    # the home depot of the vehicle currently under construction.
    DEPOT_PROXIMITY_BONUS = 3.0

    def __init__(self, instance: Instance, params: VNSParams):
        self.inst = instance
        self.p = params
        self._rng = random.Random(params.seed)
        self._np_rng = np.random.default_rng(params.seed)

        self._flood_set = set(instance.flood_indices)
        self._flood_lookup: dict[int, int] = {
            fi: k for k, fi in enumerate(instance.flood_indices)
        }

        # Depot-proximity soft constraint: for each flood, which depot NODE INDEX
        # is closest. Used to bias greedy selection toward "own" territory.
        if instance.n_depots > 0 and instance.n_floods > 0:
            depot_nodes = np.array(instance.depot_indices, dtype=int)
            flood_nodes = np.array(instance.flood_indices, dtype=int)
            sub = instance.dist_matrix[np.ix_(flood_nodes, depot_nodes)]
            self.nearest_depot = depot_nodes[np.argmin(sub, axis=1)]
        else:
            self.nearest_depot = np.zeros(instance.n_floods, dtype=int)

    def _greedy_initial(self) -> tuple[list[list[int]], list[int]]:
        """Build a feasible initial solution using nearest-neighbor + SI bias.

        Tries multiple random vehicle orderings and applies a repair phase
        after each attempt to ensure all flood volumes are served.
        """
        max_attempts = 20
        for _attempt in range(max_attempts):
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

        raise RuntimeError(
            "VNS failed to construct a feasible initial solution "
            f"after {max_attempts} attempts."
        )

    def _build_greedy_route(
        self,
        depot: int,
        cap: int,
        volumes_left: np.ndarray,
    ) -> tuple[list[int], float]:
        """Nearest-neighbour greedy route with SI-weighted selection."""
        route: list[int] = [depot]
        tank = 0.0
        current = depot
        flood_visits = 0
        max_flood_visits = max(
            3, (self.inst.n_floods * 2) // max(len(self.inst.vehicles), 1) + 1
        )
        max_steps = self.inst.n_floods * 2 + self.inst.n_ifs + 5

        for _ in range(max_steps):
            served = [
                fi
                for k, fi in enumerate(self.inst.flood_indices)
                if volumes_left[k] > 0.5
            ]
            if not served or flood_visits >= max_flood_visits:
                break

            if tank >= cap - 1e-3:
                nearest_if = self._nearest(current, self.inst.if_indices)
                route.append(nearest_if)
                tank = 0.0
                current = nearest_if
                continue

            nxt = self._greedy_next(current, served, home_depot=depot)
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
        home_depot: int,
    ) -> int:
        """Pick the candidate with best SI / distance ratio (with noise)."""
        slots = [self._flood_lookup[c] for c in candidates]
        dists = self.inst.dist_matrix[current, candidates]
        si = self.inst.si_values[slots]
        with np.errstate(divide="ignore", invalid="ignore"):
            scores = si / np.where(dists < 1e-6, 1e-6, dists)
        bonus = np.where(
            self.nearest_depot[slots] == home_depot,
            self.DEPOT_PROXIMITY_BONUS,
            1.0,
        )
        scores = scores * bonus
        noise = self._np_rng.uniform(0.8, 1.2, size=len(scores))
        scores = scores * noise
        return int(candidates[int(np.argmax(scores))])

    def _repair_one(
        self,
        routes: list[list[int]],
        capacities: list[int],
        remaining_volume: np.ndarray,
    ) -> None:
        """Add one IF+flood visit for the first unserved flood."""
        unserved = [
            (k, fi)
            for k, fi in enumerate(self.inst.flood_indices)
            if remaining_volume[k] > 0.5
        ]
        if not unserved:
            return

        _flood_slot, flood_node = unserved[0]

        best_vi = -1
        best_dist = float("inf")
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
        """Apply k random perturbation moves to produce a neighbour."""
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
        """Return indices of routes that visit at least one flood."""
        return [
            ri for ri, r in enumerate(routes)
            if any(n in self._flood_set for n in r[1:-1])
        ]

    def _shake_swap_within(self, routes: list[list[int]]) -> None:
        """Swap two random internal nodes within a random active route."""
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
        """Move a random flood visit from one route to another."""
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
        node = src.pop(pos)

        dst_ri = self._rng.choice([r for r in active if r != src_ri])
        dst = routes[dst_ri]
        insert_pos = self._rng.randint(1, max(1, len(dst) - 1))
        dst.insert(insert_pos, node)

    def _shake_reverse_segment(self, routes: list[list[int]]) -> None:
        """Reverse a random segment within a random active route (2-opt style)."""
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

        routes, capacities = self._greedy_initial()
        ev = evaluate_solution(self.inst, routes, capacities)

        if not all_floods_served(ev.remaining_volume):
            unserved_count = int(np.sum(ev.remaining_volume > 1.0))
            raise RuntimeError(
                f"VNS initial solution infeasible: "
                f"{unserved_count} flood(s) not fully served."
            )

        best_routes = [list(r) for r in routes]
        best_caps = list(capacities)
        best_z = ev.objective_z
        best_eval = ev
        trace = VNSTrace()

        for it in range(self.p.max_iterations):
            k = 1
            iter_z = best_z

            while k <= self.p.k_max:
                shaken = self._shake(best_routes, best_caps, k)

                try:
                    polished, pol_z, pol_ev = polish(
                        self.inst, shaken, best_caps, float("inf")
                    )
                except Exception:
                    k += 1
                    continue

                if not all_floods_served(pol_ev.remaining_volume):
                    k += 1
                    continue

                if pol_z + 1e-9 < best_z:
                    best_z = pol_z
                    best_routes = [list(r) for r in polished]
                    best_eval = pol_ev
                    iter_z = pol_z
                    k = 1
                else:
                    k += 1

                if (
                    self.p.time_limit_s is not None
                    and time.perf_counter() - start > self.p.time_limit_s
                ):
                    break

            trace.iter_best_z.append(float(iter_z))
            trace.best_z.append(float(best_z))

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
