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
    prune_idle_stops,
)
from app.algorithms.instance import PUMP_RATE_LPS, SERVICE_SETUP_S, Instance
from app.algorithms.local_search import polish

# Seconds held back from the time budget for the closing repair pass.
REPAIR_RESERVE_S = 3.0
# Repair estimates a route's new length before committing to it, and volumes
# shared with other routes make that estimate a few seconds optimistic. Keep a
# margin so an insertion can never tip a route past the horizon.
REPAIR_MARGIN_S = 60.0


# How long one shake-and-polish cycle may polish. Swept 0.5, 1.0 and 2.0 s over
# three seeds at a 45 s budget: iterations ranged 53 down to 16 while mean Z stayed
# inside the seed spread (991k-999k), so the shortest tested slice is used.
# See docs/iterasi-vs-kualitas.md.
DEFAULT_POLISH_SLICE_S = 0.5


@dataclass
class VNSParams:
    # An upper bound, not a target: the time budget decides how many cycles run.
    max_iterations: int = 1000
    k_max: int = 3
    seed: int | None = None
    time_limit_s: float | None = 45.0
    # Share of the usable budget kept for one deep polish of the best solution.
    final_polish_frac: float = 0.25
    # Seconds one cycle may polish; None uses DEFAULT_POLISH_SLICE_S.
    polish_slice_s: float | None = None
    # False restores the earlier behaviour: every polish runs to completion, which
    # fits only a couple of rounds into the budget.
    time_sliced_polish: bool = True


@dataclass
class VNSTrace:
    best_score: list[float] = field(default_factory=list)
    iter_best_score: list[float] = field(default_factory=list)


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
    ) -> tuple[list[int], float]:
        route: list[int] = [depot]
        tank = float(cap)  # standby full: force an IF stop before pumping
        current = depot
        clock = 0.0
        # How far a route may go is set by the deployment horizon, not by a
        # visit count: tying it to n_floods/n_vehicles capped every route at 3
        # visits and left VNS unable to work a heavy scenario at all.
        horizon = self.inst.route_horizon_s
        t = self.inst.time_matrix
        if_base = self.inst.n_depots + self.inst.n_floods
        max_steps = (self.inst.n_floods + self.inst.n_ifs) * 4 + 5
        own_floods = self.inst.depot_flood_sets.get(depot, set())

        for _ in range(max_steps):
            served = [
                fi for fi in own_floods
                if volumes_left[self._flood_lookup[fi]] > 0.5
            ]
            if not served:
                break

            if tank >= cap - 1e-3:
                nearest_if = self._nearest(current, self.inst.if_indices)
                drain = float(self.inst.if_drain_s[nearest_if - if_base])
                arrival = clock + float(t[current, nearest_if])
                if arrival + drain + float(t[nearest_if, depot]) > horizon:
                    break
                route.append(nearest_if)
                clock = arrival + drain
                tank = 0.0
                current = nearest_if
                continue

            nxt = self._greedy_next(current, served)
            flood_slot = self._flood_lookup[nxt]
            free = cap - tank
            pump = min(volumes_left[flood_slot], free)
            service = SERVICE_SETUP_S + pump / PUMP_RATE_LPS
            arrival = clock + float(t[current, nxt])
            if arrival + service + float(t[nxt, depot]) > horizon:
                break
            volumes_left[flood_slot] -= pump
            tank += pump
            route.append(nxt)
            clock = arrival + service
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

    def _repair(
        self,
        routes: list[list[int]],
        capacities: list[int],
        deadline: float | None = None,
    ) -> SolutionEval:
        """Pick up volume that shaking and polish stranded.

        The initial solution is repaired to full coverage, but the operators
        reorder stops afterwards and a vehicle can then reach a point with less
        free tank than before. They can only move existing stops, never add
        one, so coverage is restored here against the evaluator.
        """
        ev = evaluate_solution(self.inst, routes, capacities)
        for _ in range(self.inst.n_floods * 3):
            if all_floods_served(ev.remaining_volume):
                break
            if deadline is not None and time.perf_counter() >= deadline:
                break
            if not self._repair_one(routes, capacities, ev.remaining_volume):
                break
            ev = evaluate_solution(self.inst, routes, capacities)
        return ev

    def _repair_one(
        self,
        routes: list[list[int]],
        capacities: list[int],
        remaining_volume: np.ndarray,
    ) -> bool:
        unserved = [
            (k, fi)
            for k, fi in enumerate(self.inst.flood_indices)
            if remaining_volume[k] > 0.5
        ]
        # Try each unserved flood until some in-range crew can take it.
        for flood_slot, flood_node in unserved:
            if self._repair_flood(routes, capacities, flood_slot, flood_node):
                return True
        return False

    def _repair_flood(
        self,
        routes: list[list[int]],
        capacities: list[int],
        flood_slot: int,
        flood_node: int,
    ) -> bool:
        allowed = self.inst.eligible_depots[flood_slot]
        nearest_if = self._nearest(flood_node, self.inst.if_indices)

        # Only crews from depots in dispatch range. Horizon fit is part of
        # choosing, not a check on one pre-picked vehicle: the closest crew is
        # usually the busiest, so testing only that one gives up while another
        # could still take the work.
        best_vi, best_dist, best_route = -1, float("inf"), None
        for vi in (v for v in range(len(routes)) if routes[v][0] in allowed):
            route = routes[vi]
            last_stop = route[-2] if len(route) >= 2 else route[0]
            d = float(self.inst.dist_matrix[last_stop, flood_node])
            if d >= best_dist:
                continue
            candidate = route[:-1] + [nearest_if, flood_node, route[-1]]
            limit = self.inst.route_horizon_s - REPAIR_MARGIN_S
            if self._route_time(candidate, capacities[vi]) > limit:
                continue
            best_vi, best_dist, best_route = vi, d, candidate

        if best_vi < 0 or best_route is None:
            return False
        routes[best_vi] = best_route
        return True

    def _route_time(self, route: list[int], cap: int) -> float:
        """Duration of one route, replaying the tank the way the evaluator does.

        Pump time is the bulk of a stop on a heavy scenario, so leaving it out
        makes repair think a full route still has room.
        """
        t = self.inst.time_matrix
        if_base = self.inst.n_depots + self.inst.n_floods
        volumes = self.inst.volumes.copy()
        tank = float(cap)
        total = 0.0
        for a, b in zip(route[:-1], route[1:]):
            total += float(t[a, b])
            if b >= if_base:
                total += float(self.inst.if_drain_s[b - if_base])
                tank = 0.0
            elif b >= self.inst.n_depots:
                slot = b - self.inst.n_depots
                pump = min(volumes[slot], cap - tank)
                if pump > 0:
                    total += SERVICE_SETUP_S + pump / PUMP_RATE_LPS
                    volumes[slot] -= pump
                    tank += pump
        return total

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

        allowed = self.inst.eligible_depots[node - self.inst.n_depots]
        eligible = [
            r for r in active
            if r != src_ri and routes[r][0] in allowed
        ]
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
        closing_deadline = deadline - REPAIR_RESERVE_S if deadline is not None else None
        sliced = self.p.time_sliced_polish and closing_deadline is not None
        final_s = (
            self.p.final_polish_frac * (closing_deadline - start) if sliced else 0.0
        )
        search_deadline = (
            closing_deadline - final_s if closing_deadline is not None else None
        )

        routes, capacities = self._greedy_initial(search_deadline)
        ev = evaluate_solution(self.inst, routes, capacities)

        best_routes = [list(r) for r in routes]
        best_caps = list(capacities)
        best_score = ev.score
        best_eval = ev
        trace = VNSTrace()

        # One iteration is one shake-and-polish cycle at neighbourhood k. k resets to
        # 1 on an improvement and otherwise widens, wrapping after k_max, which is
        # the usual variable-neighbourhood schedule without a round that can only
        # end when the search stops improving.
        k = 1
        slice_s = self.p.polish_slice_s or DEFAULT_POLISH_SLICE_S
        for _ in range(self.p.max_iterations):
            shaken = self._shake(best_routes, best_caps, k)
            polish_deadline = search_deadline
            if sliced and search_deadline is not None:
                polish_deadline = min(search_deadline, time.perf_counter() + slice_s)

            cand_score = float("inf")
            try:
                # Evaluate shaken first so polish has a real baseline —
                # float("inf") baseline accepts every feasible candidate
                # and thrashes with scan restarts.
                shaken_ev = evaluate_solution(self.inst, shaken, best_caps)
                polished, cand_score, pol_ev = polish(
                    self.inst, shaken, best_caps, shaken_ev.score,
                    max_rounds=2, quick=True, deadline=polish_deadline,
                    rng=self._rng,
                )
            except Exception:
                polished, pol_ev = None, None

            if polished is not None and cand_score + 1e-9 < best_score:
                best_score = cand_score
                best_routes = [list(r) for r in polished]
                best_eval = pol_ev
                k = 1
            else:
                k = k % self.p.k_max + 1

            trace.iter_best_score.append(float(min(cand_score, best_score)))
            trace.best_score.append(float(best_score))

            if search_deadline is not None and time.perf_counter() >= search_deadline:
                break

        # Deep final polish of the best solution on everything the cycles left over:
        # the reserved share plus any time a cycle did not use.
        if sliced:
            remaining = closing_deadline - time.perf_counter()
            if remaining > 1.0:
                deep_routes, deep_score, deep_eval = polish(
                    self.inst, best_routes, best_caps, best_score,
                    max_rounds=10, quick=False, deadline=closing_deadline,
                    rng=self._rng,
                )
                if deep_score + 1e-9 < best_score:
                    best_routes, best_score, best_eval = deep_routes, deep_score, deep_eval
                    trace.best_score.append(float(best_score))
                    trace.iter_best_score.append(float(best_score))

        # Always close on a repair: the search may have spent its whole budget,
        # leaving shaking and polish free to strand volume.
        best_eval = self._repair(best_routes, best_caps, deadline)
        best_routes = prune_idle_stops(self.inst, best_routes, best_eval)
        best_eval = evaluate_solution(self.inst, best_routes, best_caps)
        best_score = best_eval.score

        # The repair runs after the last trace entry, so without this the curve
        # would end somewhere other than the score reported beside it.
        if not trace.best_score or trace.best_score[-1] != best_score:
            trace.best_score.append(float(best_score))
            trace.iter_best_score.append(float(best_score))

        elapsed = time.perf_counter() - start
        return VNSSolution(
            routes=best_routes,
            capacities=best_caps,
            evaluation=best_eval,
            trace=trace,
            computation_time_s=elapsed,
        )
