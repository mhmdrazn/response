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
                if clock > inst.route_horizon_s:
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
                z_total += float(inst.si_values[flood_idx]) * arrival
                r.z_contribution += float(inst.si_values[flood_idx]) * arrival
                total_flood += 1
            elif ntype == "if":
                drain = float(inst.if_drain_s[cur - inst.n_depots - inst.n_floods])
                clock += drain
                r.total_time += drain
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

    # Soft constraint: work left undone is penalised, not rejected. Converting
    # litres to pumping seconds puts the penalty in the same severity-seconds
    # unit as Z, so the two terms are directly comparable.
    left = np.maximum(volumes_left, 0.0)
    overtime = sum(max(0.0, r.total_time - inst.route_horizon_s) for r in route_evals)
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
        penalty=penalty,
        score=z_total + penalty,
    )


def all_floods_served(remaining: np.ndarray, tol: float = 1.0) -> bool:
    return bool(np.all(remaining <= tol))


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
        if r.total_time > inst.route_horizon_s + tol:
            violations.append(
                f"HC7 horizon: route {k} lasts {r.total_time / 3600:.1f}h > "
                f"{inst.route_horizon_s / 3600:.1f}h"
            )

        # HC5: Tank is 0 after visiting an IF.
        for v in r.visits:
            if v.node_type == "if" and v.tank_load_after > tol:
                violations.append(
                    f"HC5 IF-drain: route {k} IF node {v.node_index} "
                    f"tank={v.tank_load_after:.1f} (should be 0)"
                )
                break

    # HC6: Depot-geometry constraint — floods should be served by nearest depot.
    for k, r in enumerate(ev.routes):
        depot = r.depot_index
        for v in r.visits:
            if v.node_type == "flood":
                flood_slot = v.node_index - inst.n_depots
                assigned = int(inst.nearest_depot[flood_slot])
                if assigned != depot:
                    violations.append(
                        f"HC6 depot-geometry: route {k} (depot {depot}) "
                        f"serves flood {v.node_index} assigned to depot {assigned}"
                    )

    return violations
