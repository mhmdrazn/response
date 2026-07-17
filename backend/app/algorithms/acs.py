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
    # β cubes 1/d; keep at 1 so SI (∈ [0, 1]) is not steamrolled by distance.
    beta: float = 1.0
    # Slightly stronger evaporation preserves diversity across iterations.
    rho: float = 0.15
    # Lower q0 leaves ~30% of moves probabilistic — enough to escape early plateaus.
    q0: float = 0.70
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
    # Multiplier on η for a flood whose nearest depot equals the vehicle's home depot.
    DEPOT_PROXIMITY_BONUS = 3.0

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

        # O(1) flood membership + slot lookup.
        self._flood_set: set[int] = set(instance.flood_indices)
        self._flood_lookup: dict[int, int] = {
            fi: k for k, fi in enumerate(instance.flood_indices)
        }

        # Depot-proximity soft constraint: for each flood, which depot NODE INDEX
        # is closest. A vehicle whose home depot matches gets a bonus on η.
        if instance.n_depots > 0 and instance.n_floods > 0:
            depot_nodes = np.array(instance.depot_indices, dtype=int)
            flood_nodes = np.array(instance.flood_indices, dtype=int)
            sub = instance.dist_matrix[np.ix_(flood_nodes, depot_nodes)]
            self.nearest_depot = depot_nodes[np.argmin(sub, axis=1)]
        else:
            self.nearest_depot = np.zeros(instance.n_floods, dtype=int)

    # ---------------- Ant construction ----------------

    def _eta(self, i: int, j: int, home_depot: int) -> float:
        if j in self._flood_set:
            base = self.node_si[j] * self.inv_dist[i, j]
            k = self._flood_lookup[j]
            if int(self.nearest_depot[k]) == home_depot:
                return base * self.DEPOT_PROXIMITY_BONUS
            return base
        return self.inv_dist[i, j]

    def _choose_next(
        self,
        current: int,
        candidates: list[int],
        home_depot: int,
    ) -> int:
        assert candidates
        tau = self.pheromone[current, candidates]
        eta = np.array([self._eta(current, j, home_depot) for j in candidates])
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
        """Build a solution round-robin so every vehicle contributes in parallel.

        Sequential construction (previous version) let the first-shuffled vehicles
        exhaust the flood pool, leaving later vehicles with empty routes → few
        active vehicles, long tours per vehicle, t_j accumulating → high Z.
        Round-robin lets each vehicle pick one step per round, distributing load
        evenly and keeping per-vehicle tours short.
        """
        n_vehicles = len(self.inst.vehicles)
        volumes_left = self.inst.volumes.copy()

        depots = [self.inst.vehicles[vi][0] for vi in range(n_vehicles)]
        capacities = [self.inst.vehicles[vi][1] for vi in range(n_vehicles)]
        routes: list[list[int]] = [[depots[vi]] for vi in range(n_vehicles)]
        tanks = [0.0] * n_vehicles

        order = list(range(n_vehicles))
        self._rng.shuffle(order)

        # Safety cap on rounds — natural termination is "no progress this round".
        max_rounds = self.inst.n_floods * 2 + self.inst.n_ifs + 5

        for _round in range(max_rounds):
            if not np.any(volumes_left > 0.5):
                break
            made_progress = False
            for vi in order:
                served_now = [
                    fi for k, fi in enumerate(self.inst.flood_indices)
                    if volumes_left[k] > 0.5
                ]
                if not served_now:
                    break
                cur = routes[vi][-1]
                cap = capacities[vi]

                if tanks[vi] >= cap - 1e-3:
                    nearest_if = self._nearest(cur, self.inst.if_indices)
                    routes[vi].append(nearest_if)
                    self._local_update(cur, nearest_if)
                    tanks[vi] = 0.0
                    made_progress = True
                    continue

                nxt = self._choose_next(cur, served_now, home_depot=depots[vi])
                slot = self._flood_lookup[nxt]
                free = cap - tanks[vi]
                pump = float(min(volumes_left[slot], free))
                if pump <= 0:
                    continue
                volumes_left[slot] -= pump
                tanks[vi] += pump
                routes[vi].append(nxt)
                self._local_update(cur, nxt)
                made_progress = True
            if not made_progress:
                break

        for vi in range(n_vehicles):
            if routes[vi][-1] != depots[vi]:
                self._local_update(routes[vi][-1], depots[vi])
                routes[vi].append(depots[vi])

        return routes, capacities

    def _nearest(self, i: int, pool: list[int]) -> int:
        d = self.inst.dist_matrix[i, pool]
        return int(pool[int(np.argmin(d))])

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
