"""Reading a finished plan: why work was left undone, what would fix it, how evenly it is spread.

None of this changes a solution. It looks at the evaluated routes and answers the
questions a dispatcher asks next: which points were missed and why, whether one
more unit (or longer shifts) would get them, and whether the load sits on a few
crews or is shared.
"""

from __future__ import annotations

import dataclasses
import time
from dataclasses import dataclass, field
from typing import Literal

import numpy as np

from app.algorithms.acs import ACSParams, HybridACS
from app.algorithms.evaluator import SolutionEval, coverage_ratio
from app.algorithms.instance import (
    PUMP_RATE_LPS,
    SERVICE_SETUP_S,
    Instance,
)

Reason = Literal["no_unit", "out_of_range", "far", "priority", "capacity", "unscheduled"]

# One trip to a flood point that takes more than this share of a crew's shift
# leaves room for very few cycles: the point is too far to be worth the time.
FAR_SHARE_OF_SHIFT = 0.4

# Margin the repair keeps below the shift, matching the solvers.
SLACK_MARGIN_S = 60.0


@dataclass
class UnservedPoint:
    flood_id: str
    name: str
    si_value: float
    demand_l: float
    remaining_l: float
    reason: Reason
    detail: str
    depot_names: list[str] = field(default_factory=list)
    nearest_depot_min: float = 0.0


def _l(litres: float) -> str:
    """Litres with Indonesian thousands separators."""
    return f"{litres:,.0f}".replace(",", ".")


def _room(absorbable: float, remaining: float) -> str:
    """What the crews in range could still take on, in words."""
    if absorbable < 1.0:
        return "Tidak ada sisa waktu untuk satu siklus lagi."
    return f"Sisa waktu hanya cukup untuk sekitar {_l(absorbable)} L dari {_l(remaining)} L."


def _node_name(inst: Instance, node: int) -> str:
    d = inst.depots[node]
    return str(d.get("name") or f"Depo {node + 1}")


def _cycle_added_s(
    inst: Instance, route: list[int], flood_node: int, cap: int, remaining: float
) -> float:
    """Extra seconds one more empty-and-fill cycle at `flood_node` adds to `route`."""
    t = inst.time_matrix
    if_base = inst.n_depots + inst.n_floods
    prev, depot = (route[-2] if len(route) >= 2 else route[0]), route[-1]
    nif = min(inst.if_indices, key=lambda i: float(inst.dist_matrix[flood_node, i]))
    pump = min(remaining, float(cap))
    return (
        float(t[prev, nif])
        + float(inst.if_drain_s[nif - if_base])
        + float(t[nif, flood_node])
        + SERVICE_SETUP_S
        + pump / PUMP_RATE_LPS
        + float(t[flood_node, depot])
        - float(t[prev, depot])
    )


def diagnose_unserved(inst: Instance, ev: SolutionEval) -> list[UnservedPoint]:
    """Every flood point with work left, with the main reason it was not finished."""
    t = inst.time_matrix
    served = ev.remaining_volume <= 1.0
    served_si = inst.si_values[served]
    typical_si = float(np.median(served_si)) if served_si.size else float(inst.si_values.mean())

    out: list[UnservedPoint] = []
    for slot in np.where(ev.remaining_volume > 1.0)[0]:
        slot = int(slot)
        flood_node = inst.flood_indices[slot]
        remaining = float(ev.remaining_volume[slot])
        si = float(inst.si_values[slot])

        drive = [float(t[d, flood_node]) for d in inst.depot_indices]
        nearest_s = min(drive) if drive else 0.0
        allowed = inst.eligible_depots[slot]
        crews = [k for k, (d, _) in enumerate(inst.vehicles) if d in allowed]
        names = sorted({_node_name(inst, d) for d in allowed})[:3]

        def point(reason: Reason, detail: str) -> UnservedPoint:
            return UnservedPoint(
                flood_id=str(inst.floods[slot]["id"]),
                name=f"Genangan {slot + 1}",
                si_value=si,
                demand_l=float(inst.volumes[slot]),
                remaining_l=remaining,
                reason=reason,
                detail=detail,
                depot_names=names,
                nearest_depot_min=nearest_s / 60.0,
            )

        if not crews:
            out.append(
                point("no_unit", "Tidak ada kendaraan di depo yang menjangkau titik ini: "
                      + ", ".join(names) + ".")
            )
            continue

        # How much more could the crews in range still carry before their shift ends?
        absorbable = 0.0
        for k in crews:
            cap = inst.vehicles[k][1]
            added = _cycle_added_s(inst, ev.routes[k].node_indices, flood_node, cap, remaining)
            slack = inst.horizon_of(k) - SLACK_MARGIN_S - ev.routes[k].total_time
            if added > 0 and slack >= added:
                absorbable += (slack // added) * min(float(cap), remaining)
        if absorbable >= remaining:
            out.append(
                point("unscheduled", "Waktu kru masih cukup untuk titik ini; belum sempat dijadwalkan.")
            )
            continue

        if nearest_s > inst.dispatch_limit_s:
            out.append(
                point(
                    "out_of_range",
                    f"Depo terdekat butuh {nearest_s / 60:.0f} menit, di atas batas jangkauan "
                    f"{inst.dispatch_limit_s / 60:.0f} menit.",
                )
            )
            continue

        one_cycle = min(
            _cycle_added_s(inst, [inst.vehicles[k][0], inst.vehicles[k][0]], flood_node, inst.vehicles[k][1], remaining)
            for k in crews
        )
        shift = max(inst.horizon_of(k) for k in crews)
        if one_cycle > FAR_SHARE_OF_SHIFT * shift:
            out.append(
                point(
                    "far",
                    f"Satu siklus ke titik ini butuh {one_cycle / 60:.0f} menit "
                    f"({one_cycle / shift * 100:.0f}% dari jam kerja kru).",
                )
            )
        elif si < typical_si:
            out.append(
                point(
                    "priority",
                    f"Waktu kru terpakai untuk titik yang lebih mendesak lebih dulu "
                    f"(SI {si:.2f}, titik terlayani rata-rata {typical_si:.2f}). "
                    + _room(absorbable, remaining),
                )
            )
        else:
            out.append(
                point(
                    "capacity",
                    "Kru yang menjangkaunya hampir habis jam operasionalnya. "
                    + _room(absorbable, remaining),
                )
            )

    out.sort(key=lambda u: (-u.si_value * u.remaining_l, u.flood_id))
    return out


# --- What would fix it ----------------------------------------------------------


@dataclass
class Suggestion:
    kind: Literal["add_unit", "extend_shift"]
    depot_id: str
    depot_name: str
    coverage_before_pct: float
    coverage_after_pct: float
    unserved_points_after: int
    capacity_l: int | None = None
    extra_minutes: float | None = None


def _absorb(
    inst: Instance, routes: list[list[int]], caps: list[int], deadline: float
) -> SolutionEval:
    """Let the ACS repair pick up what it can on `inst`, without re-optimising anything."""
    solver = HybridACS(inst, ACSParams(seed=1, time_limit_s=None))
    return solver._repair([list(r) for r in routes], list(caps), deadline)


def suggest_fixes(
    inst: Instance,
    routes: list[list[int]],
    capacities: list[int],
    ev: SolutionEval,
    budget_s: float = 3.0,
    top: int = 3,
) -> list[Suggestion]:
    """Estimate what one more unit, or longer shifts, would do for coverage.

    Each what-if adds the unit (or stretches the shift) and lets the repair place
    the unserved work on it. That is a floor, not a re-optimised plan: a fresh
    search would usually do at least as well.
    """
    left = np.where(ev.remaining_volume > 1.0)[0]
    if left.size == 0 or not inst.vehicles:
        return []

    before = coverage_ratio(inst, ev)
    deadline = time.perf_counter() + budget_s
    horizons = [inst.horizon_of(k) for k in range(len(inst.vehicles))]
    biggest = max(cap for _, cap in inst.vehicles)

    # Depots that can reach the missed points, most useful first.
    reach: dict[int, int] = {}
    for slot in left:
        for d in inst.eligible_depots[int(slot)]:
            reach[d] = reach.get(d, 0) + 1
    candidates = sorted(reach, key=lambda d: -reach[d])[:6]

    results: list[Suggestion] = []

    def record(kind: Literal["add_unit", "extend_shift"], depot: int, after: SolutionEval, **extra: float | int) -> None:
        cov = coverage_ratio(inst, after)
        if cov - before < 0.005:
            return
        results.append(
            Suggestion(
                kind=kind,
                depot_id=str(inst.depots[depot]["id"]),
                depot_name=_node_name(inst, depot),
                coverage_before_pct=before * 100.0,
                coverage_after_pct=cov * 100.0,
                unserved_points_after=int((after.remaining_volume > 1.0).sum()),
                **extra,  # type: ignore[arg-type]
            )
        )

    for depot in candidates:
        if time.perf_counter() >= deadline:
            break
        shift = max((horizons[k] for k, (d, _) in enumerate(inst.vehicles) if d == depot), default=inst.route_horizon_s)
        bigger = dataclasses.replace(
            inst,
            vehicles=[*inst.vehicles, (depot, biggest)],
            vehicle_horizon_s=[*horizons, shift],
        )
        after = _absorb(bigger, [*routes, [depot, depot]], [*capacities, biggest], deadline)
        record("add_unit", depot, after, capacity_l=int(biggest))

    # Longer shifts only help depots whose crews actually ran out of time.
    for depot in candidates:
        if time.perf_counter() >= deadline:
            break
        owned = [k for k, (d, _) in enumerate(inst.vehicles) if d == depot]
        if not owned or max(ev.routes[k].total_time / horizons[k] for k in owned) < 0.9:
            continue
        stretched = dataclasses.replace(
            inst,
            vehicle_horizon_s=[h + 3600.0 if inst.vehicles[k][0] == depot else h for k, h in enumerate(horizons)],
        )
        after = _absorb(stretched, routes, capacities, deadline)
        record("extend_shift", depot, after, extra_minutes=60.0)

    results.sort(key=lambda s: (-s.coverage_after_pct, s.kind))
    return results[:top]


# --- How evenly the work is spread ------------------------------------------------


@dataclass
class DepotBalance:
    depot_id: str
    depot_name: str
    vehicles_total: int
    vehicles_used: int
    flood_visits: int
    pumped_l: float
    longest_route_s: float
    utilization_pct: float


@dataclass
class BalanceMetrics:
    makespan_s: float
    makespan_vehicle: int | None
    mean_route_s: float
    route_time_cv: float
    utilization_mean_pct: float
    utilization_max_pct: float
    vehicles_total: int
    vehicles_used: int
    pumped_mean_l: float
    pumped_max_l: float
    load_cv: float
    load_gini: float
    depots: list[DepotBalance] = field(default_factory=list)


def _gini(values: np.ndarray) -> float:
    """0 when every vehicle pumps the same, toward 1 when one does everything.

    Taken over the vehicles that worked: crews idle because no flood is in their
    dispatch range are a matter of geography, not of how the plan shares work.
    """
    v = np.sort(values.astype(float))
    n = v.size
    total = v.sum()
    if n == 0 or total <= 0:
        return 0.0
    return float((2 * np.arange(1, n + 1) - n - 1) @ v / (n * total))


def balance_metrics(inst: Instance, ev: SolutionEval) -> BalanceMetrics:
    pumped = np.array(
        [sum(v.volume_pumped for v in r.visits if v.node_type == "flood") for r in ev.routes]
    )
    times = np.array([r.total_time for r in ev.routes])
    horizons = np.array([inst.horizon_of(k) for k in range(len(ev.routes))])
    used = np.array([r.n_flood_visits > 0 for r in ev.routes])
    util = np.where(horizons > 0, times / horizons, 0.0)

    def cv(x: np.ndarray) -> float:
        return float(x.std() / x.mean()) if x.size and x.mean() > 0 else 0.0

    used_times = times[used]
    used_pumped = pumped[used]
    busiest = int(np.argmax(np.where(used, times, -1.0))) if used.any() else None

    depots: list[DepotBalance] = []
    for di in inst.depot_indices:
        mine = [k for k, r in enumerate(ev.routes) if r.depot_index == di]
        if not mine:
            continue
        mine_used = [k for k in mine if used[k]]
        depots.append(
            DepotBalance(
                depot_id=str(inst.depots[di]["id"]),
                depot_name=_node_name(inst, di),
                vehicles_total=len(mine),
                vehicles_used=len(mine_used),
                flood_visits=int(sum(ev.routes[k].n_flood_visits for k in mine)),
                pumped_l=float(pumped[mine].sum()),
                longest_route_s=float(times[mine].max()) if mine else 0.0,
                utilization_pct=float(util[mine_used].mean() * 100) if mine_used else 0.0,
            )
        )

    return BalanceMetrics(
        makespan_s=float(used_times.max()) if used_times.size else 0.0,
        makespan_vehicle=busiest,
        mean_route_s=float(used_times.mean()) if used_times.size else 0.0,
        route_time_cv=cv(used_times),
        utilization_mean_pct=float(util[used].mean() * 100) if used.any() else 0.0,
        utilization_max_pct=float(util[used].max() * 100) if used.any() else 0.0,
        vehicles_total=len(ev.routes),
        vehicles_used=int(used.sum()),
        pumped_mean_l=float(used_pumped.mean()) if used_pumped.size else 0.0,
        pumped_max_l=float(used_pumped.max()) if used_pumped.size else 0.0,
        load_cv=cv(used_pumped),
        load_gini=_gini(used_pumped),
        depots=depots,
    )
