# Route evaluator: Z score, arrival times, tank loads, feasibility checks

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from app.algorithms.instance import (
    PUMP_RATE_LPS,
    SERVICE_SETUP_S,
    VEHICLE_CAPACITIES_L,
    Instance,
)


@dataclass
class VisitLog:
    node_index: int
    node_type: str          # "depot" | "flood" | "if"
    arrival_time: float
    tank_load_after: float
    volume_pumped: float


@dataclass
class RouteEval:
    depot_index: int
    capacity: int
    node_indices: list[int]           # depot → ... → depot
    visits: list[VisitLog] = field(default_factory=list)
    total_distance: float = 0.0
    total_time: float = 0.0
    z_contribution: float = 0.0
    n_flood_visits: int = 0
    n_if_visits: int = 0


@dataclass
class SolutionEval:
    routes: list[RouteEval]
    objective_z: float
    total_distance: float
    total_time: float
    total_if_visits: int
    total_flood_visits: int
    remaining_volume: np.ndarray      # per flood, aligned to flood_indices
    unserved_volume: float = 0.0      # liters of pumping work left undone
    overtime_s: float = 0.0           # seconds routes run past the horizon
    penalty: float = 0.0              # cost of undone work plus overtime
    score: float = 0.0                # objective_z + penalty; what solvers rank on
    # Volumes still unpumped when each route starts. Routes are timed
    # independently and only couple through this state, so an unchanged entry
    # state means an unchanged route — that is what evaluate_incremental uses.
    entry_volumes: list[np.ndarray] = field(default_factory=list)


def _node_type(inst: Instance, idx: int) -> str:
    if idx < inst.n_depots:
        return "depot"
    if idx < inst.n_depots + inst.n_floods:
        return "flood"
    return "if"


def evaluate_solution(
    inst: Instance,
    routes: list[list[int]],
    capacities: list[int] | None = None,
) -> SolutionEval:
    if capacities is None:
        capacities = [VEHICLE_CAPACITIES_L[-1]] * len(routes)

    volumes_left = inst.volumes.copy()
    route_evals: list[RouteEval] = []
    entry_volumes: list[np.ndarray] = []

    for k, (route, cap) in enumerate(zip(routes, capacities)):
        entry_volumes.append(volumes_left.copy())
        route_evals.append(_eval_route(inst, route, cap, volumes_left, inst.horizon_of(k)))

    return _aggregate(inst, route_evals, volumes_left, entry_volumes)


def evaluate_incremental(
    inst: Instance,
    routes: list[list[int]],
    capacities: list[int],
    prev: SolutionEval,
    first_changed: int,
) -> SolutionEval:
    """Re-time only what a local-search move can have disturbed.

    Routes are timed independently; they meet only through the volume left for
    the ones after them. So routes before `first_changed` are reused outright,
    and once the running volume state matches what the previous evaluation had
    at some route, every route from there on is reused too. Most moves reorder
    stops without changing how much a route pumps, so that shortcut is the
    common case.
    """
    if not prev.entry_volumes or first_changed <= 0:
        return evaluate_solution(inst, routes, capacities)

    route_evals = list(prev.routes[:first_changed])
    entry_volumes = [v for v in prev.entry_volumes[:first_changed]]
    volumes_left = prev.entry_volumes[first_changed].copy()

    for k in range(first_changed, len(routes)):
        if k > first_changed and np.array_equal(volumes_left, prev.entry_volumes[k]):
            route_evals.extend(prev.routes[k:])
            entry_volumes.extend(prev.entry_volumes[k:])
            volumes_left = prev.remaining_volume
            break
        entry_volumes.append(volumes_left.copy())
        route_evals.append(
            _eval_route(inst, routes[k], capacities[k], volumes_left, inst.horizon_of(k))
        )

    return _aggregate(inst, route_evals, volumes_left, entry_volumes)


def _eval_route(
    inst: Instance,
    route: list[int],
    cap: int,
    volumes_left: np.ndarray,
    horizon_s: float | None = None,
) -> RouteEval:
    """Time one route and drain what it pumps out of `volumes_left` in place."""
    if not route or route[0] != route[-1]:
        raise ValueError("route must start and end at the same depot")
    horizon_s = inst.route_horizon_s if horizon_s is None else horizon_s
    depot_idx = route[0]
    r = RouteEval(depot_index=depot_idx, capacity=cap, node_indices=list(route))
    # Standby state: vehicles idle with a FULL tank, so they must empty at an
    # IF before they can pump at any flood point. Start the tank full.
    tank = float(cap)
    r.visits.append(
        VisitLog(
            node_index=depot_idx,
            node_type="depot",
            arrival_time=0.0,
            tank_load_after=tank,
            volume_pumped=0.0,
        )
    )
    clock = 0.0
    prev = depot_idx
    for cur in route[1:]:
        leg_dist = float(inst.dist_matrix[prev, cur])
        leg_time = float(inst.time_matrix[prev, cur])
        clock += leg_time
        r.total_distance += leg_dist
        r.total_time += leg_time
        ntype = _node_type(inst, cur)

        volume_pumped = 0.0
        if ntype == "flood":
            flood_idx = cur - inst.n_depots
            remaining_here = volumes_left[flood_idx]
            # Past the deployment horizon the crew is off duty: the visit
            # earns nothing, so extending a route stops paying off.
            if clock > horizon_s:
                remaining_here = 0.0
            if remaining_here <= 0:
                r.visits.append(
                    VisitLog(
                        node_index=cur,
                        node_type=ntype,
                        arrival_time=clock,
                        tank_load_after=tank,
                        volume_pumped=0.0,
                    )
                )
                prev = cur
                continue
            free_tank = cap - tank
            volume_pumped = float(min(remaining_here, free_tank))
            volumes_left[flood_idx] -= volume_pumped
            tank += volume_pumped
            arrival = clock
            pump_time = volume_pumped / PUMP_RATE_LPS
            clock += SERVICE_SETUP_S + pump_time
            r.total_time += SERVICE_SETUP_S + pump_time
            r.z_contribution += float(inst.si_values[flood_idx]) * arrival
            r.n_flood_visits += 1
        elif ntype == "if":
            drain = float(inst.if_drain_s[cur - inst.n_depots - inst.n_floods])
            clock += drain
            r.total_time += drain
            tank = 0.0
            r.n_if_visits += 1
        elif ntype == "depot":
            # End of the route — no service time.
            pass

        r.visits.append(
            VisitLog(
                node_index=cur,
                node_type=ntype,
                arrival_time=clock,
                tank_load_after=tank,
                volume_pumped=volume_pumped,
            )
        )
        prev = cur

    return r


def _aggregate(
    inst: Instance,
    route_evals: list[RouteEval],
    volumes_left: np.ndarray,
    entry_volumes: list[np.ndarray],
) -> SolutionEval:
    z_total = sum(r.z_contribution for r in route_evals)
    total_dist = sum(r.total_distance for r in route_evals)
    total_time = sum(r.total_time for r in route_evals)
    total_if = sum(r.n_if_visits for r in route_evals)
    total_flood = sum(r.n_flood_visits for r in route_evals)

    # Soft constraint: work left undone is penalised, not rejected. Converting
    # litres to pumping seconds puts the penalty in the same severity-seconds
    # unit as Z, so the two terms are directly comparable.
    left = np.maximum(volumes_left, 0.0)
    overtime = sum(
        max(0.0, r.total_time - inst.horizon_of(k)) for k, r in enumerate(route_evals)
    )
    penalty = float(
        inst.unserved_penalty * np.sum(inst.si_values * (left / PUMP_RATE_LPS))
        + inst.horizon_penalty * overtime
    )

    return SolutionEval(
        routes=route_evals,
        objective_z=z_total,
        total_distance=total_dist,
        total_time=total_time,
        total_if_visits=total_if,
        total_flood_visits=total_flood,
        remaining_volume=volumes_left,
        unserved_volume=float(left.sum()),
        overtime_s=float(overtime),
        entry_volumes=entry_volumes,
        penalty=penalty,
        score=z_total + penalty,
    )


def all_floods_served(remaining: np.ndarray, tol: float = 1.0) -> bool:
    return bool(np.all(remaining <= tol))


def prune_idle_stops(
    inst: Instance, routes: list[list[int]], ev: SolutionEval
) -> list[list[int]]:
    """Drop flood stops that pump nothing.

    A vehicle that arrives with a full tank, or at a point already drained,
    pumps zero and the stop is pure travel. Removing it leaves the tank state
    untouched, so every later stop is reached sooner and coverage cannot fall.
    Local search never removes these itself — its operators only reorder.
    """
    pruned: list[list[int]] = []
    for route, r_eval in zip(routes, ev.routes):
        idle = {
            i for i, v in enumerate(r_eval.visits)
            if v.node_type == "flood" and v.volume_pumped <= 0.0
        }
        pruned.append([n for i, n in enumerate(route) if i not in idle])
    return pruned


def coverage_ratio(inst: Instance, ev: SolutionEval) -> float:
    """Fraction of total pumping work completed, in [0, 1]."""
    total = float(inst.volumes.sum())
    if total <= 0:
        return 1.0
    return float(max(0.0, min(1.0, 1.0 - ev.unserved_volume / total)))


def validate_hard_constraints(
    inst: Instance,
    ev: SolutionEval,
    tol: float = 1.0,
) -> list[str]:
    # Full coverage is a soft constraint — unserved work is priced into the
    # objective via the penalty term, so it is reported, never a violation.
    violations: list[str] = []

    for k, r in enumerate(ev.routes):
        nodes = r.node_indices
        # HC2: Route starts and ends at same depot.
        if not nodes or nodes[0] != nodes[-1]:
            violations.append(
                f"HC2 depot-balance: route {k} start={nodes[0] if nodes else '?'} "
                f"end={nodes[-1] if nodes else '?'}"
            )
        if nodes and _node_type(inst, nodes[0]) != "depot":
            violations.append(
                f"HC2 depot-balance: route {k} starts at non-depot node {nodes[0]}"
            )

        # HC3 + HC4: Tank capacity never exceeded.
        for v in r.visits:
            if v.tank_load_after > r.capacity + tol:
                violations.append(
                    f"HC3 capacity: route {k} node {v.node_index} "
                    f"tank={v.tank_load_after:.1f} > cap={r.capacity}"
                )
                break

        # HC7: Route fits inside one deployment.
        if r.total_time > inst.horizon_of(k) + tol:
            violations.append(
                f"HC7 horizon: route {k} lasts {r.total_time / 3600:.1f}h > "
                f"{inst.horizon_of(k) / 3600:.1f}h"
            )

        # HC5: Tank is 0 after visiting an IF.
        for v in r.visits:
            if v.node_type == "if" and v.tank_load_after > tol:
                violations.append(
                    f"HC5 IF-drain: route {k} IF node {v.node_index} "
                    f"tank={v.tank_load_after:.1f} (should be 0)"
                )
                break

    # HC6: Dispatch constraint — a flood is served only by a depot within the
    # drive-time limit (or its nearest depot when none is in range).
    for k, r in enumerate(ev.routes):
        depot = r.depot_index
        for v in r.visits:
            if v.node_type == "flood":
                flood_slot = v.node_index - inst.n_depots
                if depot not in inst.eligible_depots[flood_slot]:
                    violations.append(
                        f"HC6 dispatch: route {k} (depot {depot}) serves flood "
                        f"{v.node_index} beyond its dispatch range"
                    )

    return violations
