"""Hybrid Ant Colony System for MDCVRP-IF-SI.

Design decisions:
- One vehicle per depot per iteration (capacity taken from ``DEFAULT_CAPACITY_L``).
- η(i, j) = SI_j / d(i, j) for flood points; η(i, r) = 1 / d(i, r) for IFs.
- Pseudorandom-proportional transition rule with q0.
- Local pheromone update after each move; global update at end of iteration
  using best-so-far solution and evaporation ρ.
- Every 5 iterations the best-of-iteration is polished with local search.
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
class ACSParams:
    iterations: int = 60
    n_ants: int = 20
    alpha: float = 1.0
    beta: float = 3.0
    rho: float = 0.10
    q0: float = 0.90
    seed: int | None = None
    time_limit_s: float | None = 45.0


@dataclass
class ACSTrace:
    best_z: list[float] = field(default_factory=list)
    iter_best_z: list[float] = field(default_factory=list)


@dataclass
class ACSSolution:
    routes: list[list[int]]
    capacities: list[int]
    evaluation: SolutionEval
    trace: ACSTrace
    computation_time_s: float


class HybridACS:
    def __init__(self, instance: Instance, params: ACSParams):
        self.inst = instance
        self.p = params
        self._rng = random.Random(params.seed)
        self._np_rng = np.random.default_rng(params.seed)

        # Nearest-neighbour tour length estimate for pheromone init.
        n_total = instance.n_total
        d = instance.dist_matrix.copy()
        np.fill_diagonal(d, np.inf)
        nn_len = float(d.min(axis=1).mean() * (instance.n_floods + 1))
        self.tau0 = 1.0 / max(n_total * nn_len, 1.0)
        self.pheromone = np.full((n_total, n_total), self.tau0)
        with np.errstate(divide="ignore"):
            self.inv_dist = 1.0 / np.where(d == np.inf, 1.0, d)

        # Per-node severity lookup for η computation.
        self.node_si = np.zeros(n_total)
        for k, fi in enumerate(instance.flood_indices):
            self.node_si[fi] = instance.si_values[k]

    # ---------------- Ant construction ----------------

    def _eta(self, i: int, j: int) -> float:
        if j in self.inst.flood_indices:
            return self.node_si[j] * self.inv_dist[i, j]
        return self.inv_dist[i, j]

    def _choose_next(
        self,
        current: int,
        candidates: list[int],
    ) -> int:
        assert candidates
        tau = self.pheromone[current, candidates]
        eta = np.array([self._eta(current, j) for j in candidates])
        score = (tau ** self.p.alpha) * (eta ** self.p.beta)
        if self._rng.random() < self.p.q0:
            return int(candidates[int(np.argmax(score))])
            
        total = score.sum()
        if total <= 0:
            return int(self._rng.choice(candidates))
        probs = score / total
        idx = int(self._np_rng.choice(len(candidates), p=probs))
        return int(candidates[idx])

    def _construct_one_ant(self) -> tuple[list[list[int]], list[int]]:
        """Build one full solution using all vehicles. Returns (routes, capacities)."""
        volumes_left = self.inst.volumes.copy()
        n_vehicles = len(self.inst.vehicles)

        # Shuffle vehicle order so different ants try different depot priorities.
        order = list(range(n_vehicles))
        self._rng.shuffle(order)

        route_map: dict[int, list[int]] = {}
        cap_map: dict[int, int] = {}
        for vi in order:
            depot, cap = self.inst.vehicles[vi]
            if all(v <= 0.5 for v in volumes_left):
                route_map[vi] = [depot, depot]
                cap_map[vi] = cap
                continue
            route, _tank = self._build_route(depot, cap, volumes_left)
            route_map[vi] = route
            cap_map[vi] = cap

        # Return in canonical vehicle order.
        routes = [route_map[i] for i in range(n_vehicles)]
        capacities = [cap_map[i] for i in range(n_vehicles)]
        return routes, capacities

    def _build_route(
        self,
        depot: int,
        cap: int,
        volumes_left: np.ndarray,
    ) -> tuple[list[int], float]:
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
                # Need an IF to drain.
                nearest_if = self._nearest(current, self.inst.if_indices)
                route.append(nearest_if)
                tank = 0.0
                current = nearest_if
                self._local_update(route[-2], route[-1])
                continue
            # Choose next flood — smaller candidate list for speed.
            k = min(6, len(served))
            top = self._k_closest(current, served, k)
            nxt = self._choose_next(current, top)
            flood_slot = self.inst.flood_indices.index(nxt)
            free = cap - tank
            pump = min(volumes_left[flood_slot], free)
            volumes_left[flood_slot] -= pump
            tank += pump
            route.append(nxt)
            flood_visits += 1
            self._local_update(current, nxt)
            current = nxt
        # Return to depot.
        route.append(depot)
        self._local_update(current, depot)
        return route, tank

    def _nearest(self, i: int, pool: list[int]) -> int:
        d = self.inst.dist_matrix[i, pool]
        return int(pool[int(np.argmin(d))])

    def _k_closest(self, i: int, pool: list[int], k: int) -> list[int]:
        d = self.inst.dist_matrix[i, pool]
        order = np.argsort(d)[:k]
        return [pool[int(x)] for x in order]

    # ---------------- Pheromone updates ----------------

    def _local_update(self, i: int, j: int) -> None:
        self.pheromone[i, j] = (1 - self.p.rho) * self.pheromone[i, j] + self.p.rho * self.tau0
        self.pheromone[j, i] = self.pheromone[i, j]

    def _global_update(self, best_routes: list[list[int]], best_z: float) -> None:
        deposit = 1.0 / max(best_z, 1e-6)
        # Evaporate.
        self.pheromone *= 1 - self.p.rho
        # Reinforce edges of best solution.
        for route in best_routes:
            for a, b in zip(route[:-1], route[1:]):
                self.pheromone[a, b] += self.p.rho * deposit
                self.pheromone[b, a] = self.pheromone[a, b]

    # ---------------- Main loop ----------------

    def solve(self) -> ACSSolution:
        start = time.perf_counter()
        best_routes: list[list[int]] | None = None
        best_caps: list[int] | None = None
        best_z = float("inf")
        best_eval: SolutionEval | None = None
        trace = ACSTrace()

        for it in range(self.p.iterations):
            iter_best_z = float("inf")
            iter_best_routes: list[list[int]] | None = None
            iter_best_caps: list[int] | None = None

            for _ in range(self.p.n_ants):
                routes, caps = self._construct_one_ant()
                ev = evaluate_solution(self.inst, routes, caps)
                if not all_floods_served(ev.remaining_volume):
                    continue
                if ev.objective_z < iter_best_z:
                    iter_best_z = ev.objective_z
                    iter_best_routes = copy.deepcopy(routes)
                    iter_best_caps = list(caps)

            if iter_best_routes is None:
                trace.iter_best_z.append(best_z if best_z != float("inf") else 0.0)
                trace.best_z.append(best_z if best_z != float("inf") else 0.0)
                continue

            # Polish best-of-iteration every 5 iterations.
            if it % 5 == 0:
                iter_best_routes, iter_best_z, ev = polish(
                    self.inst, iter_best_routes, iter_best_caps, iter_best_z
                )

            if iter_best_z < best_z:
                best_z = iter_best_z
                best_routes = copy.deepcopy(iter_best_routes)
                best_caps = list(iter_best_caps or [])
                best_eval = ev if it % 5 == 0 else evaluate_solution(
                    self.inst, best_routes, best_caps
                )

            self._global_update(best_routes or iter_best_routes, best_z)
            trace.iter_best_z.append(float(iter_best_z))
            trace.best_z.append(float(best_z))

            if (
                self.p.time_limit_s is not None
                and time.perf_counter() - start > self.p.time_limit_s
            ):
                break

        if best_routes is None or best_eval is None or best_caps is None:
            raise RuntimeError("ACS did not find any feasible solution.")

        elapsed = time.perf_counter() - start
        return ACSSolution(
            routes=best_routes,
            capacities=best_caps,
            evaluation=best_eval,
            trace=trace,
            computation_time_s=elapsed,
        )
