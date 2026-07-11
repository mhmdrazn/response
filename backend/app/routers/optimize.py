"""POST /api/optimize/{acs|vns} — run a solver and return an interactive result."""

from __future__ import annotations

import logging
from collections import Counter

from fastapi import APIRouter, HTTPException

import app.data as data
from app.algorithms.acs import ACSParams, HybridACS
from app.algorithms.vns import VNS, VNSParams
from app.algorithms.evaluator import SolutionEval, validate_hard_constraints
from app.algorithms.osrm import fetch_road_geometry
from app.algorithms.instance import (
    SBY_LAT_MAX,
    SBY_LAT_MIN,
    SBY_LON_MAX,
    SBY_LON_MIN,
    Instance,
    build_instance,
)
from app.models.optimization import (
    ACSRequest,
    VNSRequest,
    ConvergencePoint,
    OptimizationResponse,
    RouteOut,
    VisitOut,
)
from app.severity.index import compute_severity_index

_log = logging.getLogger("response.optimize")

router = APIRouter(prefix="/api/optimize", tags=["optimize"])


def _build_ready_instance() -> Instance:
    if data.flood_points is None or data.depots is None or data.ifs is None:
        raise HTTPException(
            status_code=503,
            detail="Dataset floods/depo/if belum lengkap.",
        )
    faskes_df = data.faskes if data.faskes is not None else data.flood_points.iloc[0:0]
    sev = compute_severity_index(data.flood_points, faskes_df)
    return build_instance(
        depots_df=data.depots,
        floods_df=data.flood_points,
        ifs_df=data.ifs,
        dist_matrix=data.distance_matrix,
        time_matrix=data.time_matrix,
        si_values=sev.si_values,
    )


def _node_meta(inst: Instance, idx: int) -> tuple[str, str, str, float, float]:
    """Return (node_id, node_type, node_name, lat, lon) for a unified index."""
    if idx < inst.n_depots:
        n = inst.depots[idx]
        name = str(n.get("name") or f"Depo {idx + 1}")
        return str(n["id"]), "depot", name, float(n["lat"]), float(n["lon"])
    if idx < inst.n_depots + inst.n_floods:
        fi = idx - inst.n_depots
        n = inst.floods[fi]
        name = f"Genangan {fi + 1}"
        return str(n["id"]), "flood", name, float(n["lat"]), float(n["lon"])
    n = inst.ifs[idx - inst.n_depots - inst.n_floods]
    name = str(n.get("highway_name") or n.get("waterway_name") or n["id"])
    return str(n["id"]), "if", name, float(n["lat"]), float(n["lon"])


def _count_revisits(routes: list[list[int]]) -> int:
    counter: Counter[int] = Counter()
    for r in routes:
        for node in r[1:-1]:  # skip depot endpoints
            counter[node] += 1
    return sum(v - 1 for v in counter.values() if v > 1)


def _coord_valid(lat: float, lon: float) -> bool:
    return (
        SBY_LAT_MIN <= lat <= SBY_LAT_MAX
        and SBY_LON_MIN <= lon <= SBY_LON_MAX
    )


def _to_response(
    inst: Instance,
    routes: list[list[int]],
    capacities: list[int],
    ev: SolutionEval,
    convergence_best: list[float],
    convergence_iter: list[float],
    computation_time_s: float,
    algorithm: str,
) -> OptimizationResponse:
    routes_out: list[RouteOut] = []
    for k, r_eval in enumerate(ev.routes):
        if not any(_node_meta(inst, i)[1] == "flood" for i in r_eval.node_indices):
            continue  # skip vehicles that did nothing
        visits_out: list[VisitOut] = []
        waypoints: list[tuple[float, float]] = []
        for v in r_eval.visits:
            nid, ntype, nname, lat, lon = _node_meta(inst, v.node_index)
            if not _coord_valid(lat, lon):
                _log.warning(
                    "Route V%02d: skipping out-of-bounds coord (%f, %f) for node %s",
                    k + 1, lat, lon, nid,
                )
                continue
            visits_out.append(
                VisitOut(
                    node_id=nid,
                    node_name=nname,
                    node_type=ntype,
                    lat=lat,
                    lon=lon,
                    arrival_time_s=v.arrival_time,
                    tank_load_after_l=v.tank_load_after,
                    volume_pumped_l=v.volume_pumped,
                )
            )
            waypoints.append((lat, lon))

        road_poly = fetch_road_geometry(waypoints)
        polyline: list[list[float]] = (
            road_poly if road_poly is not None
            else [[lat, lon] for lat, lon in waypoints]
        )

        depot_id, _, depot_name, _, _ = _node_meta(inst, r_eval.depot_index)
        n_flood = sum(1 for v in r_eval.visits if v.node_type == "flood")
        n_if = sum(1 for v in r_eval.visits if v.node_type == "if")
        cap_label = f"{r_eval.capacity // 1000}K" if r_eval.capacity >= 1000 else str(r_eval.capacity)
        routes_out.append(
            RouteOut(
                vehicle_id=f"V{k+1:02d}-{cap_label}",
                depot_id=depot_id,
                depot_name=depot_name,
                capacity_l=r_eval.capacity,
                route_color_index=k % 8,
                total_distance_m=r_eval.total_distance,
                total_time_s=r_eval.total_time,
                z_contribution=r_eval.z_contribution,
                visit_count_flood=n_flood,
                visit_count_if=n_if,
                polyline=polyline,
                visits=visits_out,
            )
        )

    convergence = [
        ConvergencePoint(iteration=i + 1, best_z=b, iter_best_z=ib)
        for i, (b, ib) in enumerate(zip(convergence_best, convergence_iter))
    ]

    return OptimizationResponse(
        algorithm=algorithm,  # type: ignore[arg-type]
        routes=routes_out,
        objective_z=ev.objective_z,
        total_distance_m=ev.total_distance,
        total_time_s=ev.total_time,
        total_if_visits=ev.total_if_visits,
        total_flood_visits=ev.total_flood_visits,
        total_revisits=_count_revisits(routes),
        computation_time_s=computation_time_s,
        convergence=convergence,
        n_vehicles=len(routes_out),
    )


@router.post("/acs", response_model=OptimizationResponse)
async def run_acs(request: ACSRequest) -> OptimizationResponse:
    try:
        inst = _build_ready_instance()
        params = ACSParams(
            iterations=request.iterations,
            n_ants=request.n_ants,
            alpha=request.alpha,
            beta=request.beta,
            rho=request.rho,
            q0=request.q0,
            seed=request.seed,
            time_limit_s=request.time_limit_s,
        )
        solver = HybridACS(inst, params)
        sol = solver.solve()

        violations = validate_hard_constraints(inst, sol.evaluation)
        if violations:
            for v in violations:
                _log.warning("Constraint violation: %s", v)

        return _to_response(
            inst=inst,
            routes=sol.routes,
            capacities=sol.capacities,
            ev=sol.evaluation,
            convergence_best=sol.trace.best_z,
            convergence_iter=sol.trace.iter_best_z,
            computation_time_s=sol.computation_time_s,
            algorithm="acs",
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/vns", response_model=OptimizationResponse)
async def run_vns(request: VNSRequest) -> OptimizationResponse:
    try:
        inst = _build_ready_instance()
        params = VNSParams(
            max_iterations=request.max_iterations,
            k_max=request.k_max,
            seed=request.seed,
            time_limit_s=request.time_limit_s,
        )
        solver = VNS(inst, params)
        sol = solver.solve()

        violations = validate_hard_constraints(inst, sol.evaluation)
        if violations:
            for v in violations:
                _log.warning("VNS constraint violation: %s", v)

        return _to_response(
            inst=inst,
            routes=sol.routes,
            capacities=sol.capacities,
            ev=sol.evaluation,
            convergence_best=sol.trace.best_z,
            convergence_iter=sol.trace.iter_best_z,
            computation_time_s=sol.computation_time_s,
            algorithm="vns",
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc
