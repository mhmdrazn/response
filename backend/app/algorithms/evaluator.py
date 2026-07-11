"""Route evaluator — compute Z, arrival times, tank loads, feasibility.

A **route** is a list of node indices (in the unified index space defined by
``Instance``) that starts and ends at the same depot. A **solution** is a
list of routes, one per vehicle used.

Every ACS / VNS iteration hands its candidate solutions to this module so
scoring stays deterministic and constraint checks are centralized.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from app.algorithms.instance import (
    IF_DRAIN_S,
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


@dataclass
class SolutionEval:
    routes: list[RouteEval]
    objective_z: float
    total_distance: float
    total_time: float
    total_if_visits: int
    total_flood_visits: int
    remaining_volume: np.ndarray      # per flood, aligned to flood_indices


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
    """Score a solution end-to-end.

    ``routes[k]`` is the full node sequence for vehicle *k* (first == last).
    ``capacities[k]`` is optional; defaults to ``DEFAULT_CAPACITY_L`` per vehicle.
    """
    if capacities is None:
        capacities = [VEHICLE_CAPACITIES_L[-1]] * len(routes)

    volumes_left = inst.volumes.copy()
    route_evals: list[RouteEval] = []
    z_total = 0.0
    total_dist = 0.0
    total_time = 0.0
    total_if = 0
    total_flood = 0

    for route, cap in zip(routes, capacities):
        if not route or route[0] != route[-1]:
            raise ValueError("route must start and end at the same depot")
        depot_idx = route[0]
        r = RouteEval(depot_index=depot_idx, capacity=cap, node_indices=list(route))
        # depot start
        r.visits.append(
            VisitLog(
                node_index=depot_idx,
                node_type="depot",
                arrival_time=0.0,
                tank_load_after=0.0,
                volume_pumped=0.0,
            )
        )
        tank = 0.0
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
                z_total += float(inst.si_values[flood_idx]) * arrival
                r.z_contribution += float(inst.si_values[flood_idx]) * arrival
                total_flood += 1
            elif ntype == "if":
                clock += IF_DRAIN_S
                r.total_time += IF_DRAIN_S
                tank = 0.0
                total_if += 1
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

        route_evals.append(r)
        total_dist += r.total_distance
        total_time += r.total_time

    return SolutionEval(
        routes=route_evals,
        objective_z=z_total,
        total_distance=total_dist,
        total_time=total_time,
        total_if_visits=total_if,
        total_flood_visits=total_flood,
        remaining_volume=volumes_left,
    )


def all_floods_served(remaining: np.ndarray, tol: float = 1.0) -> bool:
    return bool(np.all(remaining <= tol))


def validate_hard_constraints(
    inst: Instance,
    ev: SolutionEval,
    tol: float = 1.0,
) -> list[str]:
    """Check all 6 hard constraints. Returns a list of violation descriptions (empty = feasible)."""
    violations: list[str] = []

    # HC1: All flood volume served.
    unserved = np.where(ev.remaining_volume > tol)[0]
    if len(unserved) > 0:
        ids = [str(inst.flood_indices[int(i)]) for i in unserved[:5]]
        violations.append(
            f"HC1 volume: {len(unserved)} flood(s) not fully served "
            f"(nodes {', '.join(ids)})"
        )

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

        # HC5: Tank is 0 after visiting an IF.
        for v in r.visits:
            if v.node_type == "if" and v.tank_load_after > tol:
                violations.append(
                    f"HC5 IF-drain: route {k} IF node {v.node_index} "
                    f"tank={v.tank_load_after:.1f} (should be 0)"
                )
                break

    # HC6: No subtours — every route touches a depot. Already guaranteed by
    # construction (route[0] == route[-1] == depot), so HC2 check covers it.

    return violations
