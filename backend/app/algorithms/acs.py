# Hybrid ACS for MDCVRP-IF-SI
# η(i,j) = SI_j / d(i,j); pseudorandom-proportional with q0
# Local pheromone update per move; global update per iteration with ρ

from __future__ import annotations

import copy
import random
import time
from dataclasses import dataclass, field

import numpy as np

from app.algorithms.evaluator import (
    SolutionEval,
    evaluate_solution,
)
from app.algorithms.instance import PUMP_RATE_LPS, SERVICE_SETUP_S, Instance
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
    def __init__(self, instance: Instance, params: ACSParams):
        self.inst = instance
        self.p = params
        self._rng = random.Random(params.seed)
        self._np_rng = np.random.default_rng(params.seed)

        n_total = instance.n_total
        d = instance.dist_matrix.copy()
        np.fill_diagonal(d, np.inf)
        nn_len = float(d.min(axis=1).mean() * (instance.n_floods + 1))
        self.tau0 = 1.0 / max(n_total * nn_len, 1.0)
        self.pheromone = np.full((n_total, n_total), self.tau0)
        # Floor off-diagonal distances at 1 m before inverting. Coincident nodes
        # (dist 0, e.g. duplicate flood coordinates) would otherwise give an
        # infinite heuristic that turns transition probabilities into NaN.
        d_eff = np.where(d == np.inf, 1.0, np.maximum(d, 1.0))
        self.inv_dist = 1.0 / d_eff

        self.node_si = np.zeros(n_total)
        for k, fi in enumerate(instance.flood_indices):
            self.node_si[fi] = instance.si_values[k]

        self._flood_set: set[int] = set(instance.flood_indices)
        self._flood_lookup: dict[int, int] = {
            fi: k for k, fi in enumerate(instance.flood_indices)
        }

    # ---------------- Ant construction ----------------

    def _eta(self, i: int, j: int) -> float:
        if j in self._flood_set:
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
        # Defensive: never let a non-finite heuristic reach argmax/choice.
        score = np.nan_to_num(score, nan=0.0, posinf=0.0, neginf=0.0)
        if self._rng.random() < self.p.q0:
            return int(candidates[int(np.argmax(score))])

        total = score.sum()
        if not np.isfinite(total) or total <= 0:
            return int(self._rng.choice(candidates))
        probs = score / total
        idx = int(self._np_rng.choice(len(candidates), p=probs))
        return int(candidates[idx])

    def _construct_one_ant(self) -> tuple[list[list[int]], list[int]]:
        n_vehicles = len(self.inst.vehicles)
        volumes_left = self.inst.volumes.copy()

        depots = [self.inst.vehicles[vi][0] for vi in range(n_vehicles)]
        capacities = [self.inst.vehicles[vi][1] for vi in range(n_vehicles)]
        routes: list[list[int]] = [[depots[vi]] for vi in range(n_vehicles)]
        # Standby full: a deployed vehicle must visit an IF (empty) before it can
        # pump. Starting full makes the "tank full -> go to IF" branch fire first.
        tanks = [float(capacities[vi]) for vi in range(n_vehicles)]
        clocks = [0.0] * n_vehicles

        def step(vi: int, nxt: int, service_s: float) -> bool:
            """Append nxt to vi's route if it still gets home inside the horizon."""
            cur = routes[vi][-1]
            t = self.inst.time_matrix
            arrival = clocks[vi] + float(t[cur, nxt])
            home = float(t[nxt, depots[vi]])
            if arrival + service_s + home > self.inst.route_horizon_s:
                return False
            clocks[vi] = arrival + service_s
            routes[vi].append(nxt)
            self._local_update(cur, nxt)
            return True

        order = list(range(n_vehicles))
        self._rng.shuffle(order)

        max_rounds = self.inst.n_floods * 2 + self.inst.n_ifs + 5
        depot_floods = self.inst.depot_flood_sets
        if_base = self.inst.n_depots + self.inst.n_floods

        for _round in range(max_rounds):
            if not np.any(volumes_left > 0.5):
                break
            made_progress = False
            for vi in order:
                home = depots[vi]
                # Hard constraint: only serve floods assigned to this depot
                own_floods = depot_floods.get(home, set())
                served_now = [
                    fi for fi in own_floods
                    if volumes_left[self._flood_lookup[fi]] > 0.5
                ]
                if not served_now:
                    continue
                cur = routes[vi][-1]
                cap = capacities[vi]

                if tanks[vi] >= cap - 1e-3:
                    nearest_if = self._nearest(cur, self.inst.if_indices)
                    drain = float(self.inst.if_drain_s[nearest_if - if_base])
                    if not step(vi, nearest_if, drain):
                        continue
                    tanks[vi] = 0.0
                    made_progress = True
                    continue

                nxt = self._choose_next(cur, served_now)
                slot = self._flood_lookup[nxt]
                free = cap - tanks[vi]
                pump = float(min(volumes_left[slot], free))
                if pump <= 0:
                    continue
                if not step(vi, nxt, SERVICE_SETUP_S + pump / PUMP_RATE_LPS):
                    continue
                volumes_left[slot] -= pump
                tanks[vi] += pump
                made_progress = True
            if not made_progress:
                break

        # Overflow: if some floods still unserved, allow any vehicle
        if np.any(volumes_left > 0.5):
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
                        drain = float(self.inst.if_drain_s[nearest_if - if_base])
                        if not step(vi, nearest_if, drain):
                            continue
                        tanks[vi] = 0.0
                        made_progress = True
                        continue
                    nxt = self._choose_next(cur, served_now)
                    slot = self._flood_lookup[nxt]
                    free = cap - tanks[vi]
                    pump = float(min(volumes_left[slot], free))
                    if pump <= 0:
                        continue
                    if not step(vi, nxt, SERVICE_SETUP_S + pump / PUMP_RATE_LPS):
                        continue
                    volumes_left[slot] -= pump
                    tanks[vi] += pump
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

    def _global_update(self, best_routes: list[list[int]], best_score: float) -> None:
        deposit = 1.0 / max(best_score, 1e-6)
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
        deadline = (
            start + self.p.time_limit_s if self.p.time_limit_s is not None else None
        )
        best_routes: list[list[int]] | None = None
        best_caps: list[int] | None = None
        best_score = float("inf")
        best_eval: SolutionEval | None = None
        trace = ACSTrace()

        for it in range(self.p.iterations):
            iter_best_score = float("inf")
            iter_best_routes: list[list[int]] | None = None
            iter_best_caps: list[int] | None = None

            for _ in range(self.p.n_ants):
                if deadline is not None and time.perf_counter() >= deadline:
                    break
                routes, caps = self._construct_one_ant()
                ev = evaluate_solution(self.inst, routes, caps)
                if ev.score < iter_best_score:
                    iter_best_score = ev.score
                    iter_best_routes = copy.deepcopy(routes)
                    iter_best_caps = list(caps)

            if iter_best_routes is None:
                fallback = best_score if best_score != float("inf") else 0.0
                trace.iter_best_z.append(fallback)
                trace.best_z.append(fallback)
                continue

            # Stratified polish: quick per iter, full every 5 iter.
            # Quick = only 2-opt + relocate (fast). Full adds or-opt + exchange.
            if it % 5 == 0 and it > 0:
                iter_best_routes, iter_best_score, ev = polish(
                    self.inst, iter_best_routes, iter_best_caps, iter_best_score,
                    max_rounds=3, quick=False, deadline=deadline,
                )
            else:
                iter_best_routes, iter_best_score, ev = polish(
                    self.inst, iter_best_routes, iter_best_caps, iter_best_score,
                    max_rounds=1, quick=True, deadline=deadline,
                )

            if iter_best_score < best_score:
                best_score = iter_best_score
                best_routes = copy.deepcopy(iter_best_routes)
                best_caps = list(iter_best_caps or [])
                best_eval = ev

            self._global_update(best_routes or iter_best_routes, best_score)
            trace.iter_best_z.append(float(iter_best_score))
            trace.best_z.append(float(best_score))

            if (
                self.p.time_limit_s is not None
                and time.perf_counter() - start > self.p.time_limit_s
            ):
                break

        if best_routes is None or best_eval is None or best_caps is None:
            raise RuntimeError("ACS did not construct any solution.")

        # Intensive final polish — use whatever time budget remains to
        # deep-polish the best-so-far solution. Runs all four operators
        # with high max_rounds; guarded by remaining time budget.
        elapsed = time.perf_counter() - start
        budget_left = (self.p.time_limit_s or 0.0) - elapsed
        if budget_left > 2.0:
            polished_routes, polished_score, polished_eval = polish(
                self.inst, best_routes, best_caps, best_score,
                max_rounds=10, quick=False, deadline=deadline,
            )
            if polished_score + 1e-9 < best_score:
                best_routes = polished_routes
                best_score = polished_score
                best_eval = polished_eval
                trace.best_z.append(float(best_score))
                trace.iter_best_z.append(float(best_score))

        elapsed = time.perf_counter() - start
        return ACSSolution(
            routes=best_routes,
            capacities=best_caps,
            evaluation=best_eval,
            trace=trace,
            computation_time_s=elapsed,
        )
