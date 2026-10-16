"""Live traffic: scale the precomputed travel times by current congestion.

A full traffic-aware matrix over every node (depots, floods and ~140 outlets) is
tens of thousands of elements, and the Routes API bills each one. So a budget of
the legs the plan actually drives is sampled instead:

  depot -> every flood it may dispatch to
  flood -> its nearest outlets and nearest floods

For each sampled leg Google returns the duration in current traffic and the same
route's duration without traffic; their ratio is the congestion on that leg.
Every node gets a factor, the median ratio of its sampled legs (a node with none
borrows from its nearest sampled neighbours), and the OSRM time of a leg i -> j is
scaled by sqrt(f_i * f_j). Legs that were sampled use their own ratio exactly.
"""

from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone

import httpx
import numpy as np

from app import config

_log = logging.getLogger("response.traffic")

ROUTES_MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"
FIELD_MASK = "originIndex,destinationIndex,status,condition,duration,staticDuration"

# Destinations per request. With TRAFFIC_AWARE the Routes API caps a request at
# 625 elements; one origin per request keeps every request well inside that.
MAX_DESTINATIONS = 25
K_OUTLETS = 2
K_FLOODS = 2
# A ratio outside this band is a routing quirk (a closed road, a detour), not traffic.
MIN_FACTOR, MAX_FACTOR = 1.0, 4.0
REQUEST_TIMEOUT_S = 20.0
WORKERS = 8


class TrafficUnavailable(RuntimeError):
    """Traffic was asked for but could not be used; the message is for the user."""


@dataclass
class TrafficSnapshot:
    factors: np.ndarray                         # per node, aligned to the node space
    ratios: dict[tuple[int, int], float]        # sampled legs -> traffic / free-flow
    fetched_at: datetime
    requested_pairs: int
    sampled_pairs: int = field(init=False)

    def __post_init__(self) -> None:
        self.sampled_pairs = len(self.ratios)

    @property
    def mean_factor(self) -> float:
        return float(np.mean(list(self.ratios.values()))) if self.ratios else 1.0

    @property
    def max_factor(self) -> float:
        return float(max(self.ratios.values())) if self.ratios else 1.0


def configured() -> bool:
    return bool(config.GOOGLE_MAPS_API_KEY)


# --- Which legs to ask about -----------------------------------------------------


def sample_pairs(
    time_matrix: np.ndarray,
    n_depots: int,
    n_floods: int,
    dispatch_limit_s: float,
    budget: int,
) -> dict[int, list[int]]:
    """Origin -> destinations to query, most useful legs first, within `budget` elements."""
    n_total = time_matrix.shape[0]
    depots = list(range(n_depots))
    floods = list(range(n_depots, n_depots + n_floods))
    outlets = list(range(n_depots + n_floods, n_total))

    wanted: list[tuple[int, int]] = []
    # 1. Dispatch legs: the drive every route starts with.
    for d in depots:
        reach = [f for f in floods if time_matrix[d, f] <= dispatch_limit_s]
        if not reach and floods:
            reach = [min(floods, key=lambda f: time_matrix[d, f])]
        wanted += [(d, f) for f in reach]
    # 2. Flood -> nearest outlets: every tank is emptied there.
    for f in floods:
        near = sorted(outlets, key=lambda o: time_matrix[f, o])[:K_OUTLETS]
        wanted += [(f, o) for o in near]
    # 3. Flood -> nearest floods: the hops between pumping stops.
    for f in floods:
        near = sorted((g for g in floods if g != f), key=lambda g: time_matrix[f, g])[:K_FLOODS]
        wanted += [(f, g) for g in near]

    plan: dict[int, list[int]] = {}
    seen: set[tuple[int, int]] = set()
    for pair in wanted:
        if len(seen) >= budget:
            break
        if pair in seen or pair[0] == pair[1]:
            continue
        seen.add(pair)
        plan.setdefault(pair[0], []).append(pair[1])
    return plan


# --- Asking Google ---------------------------------------------------------------


def _seconds(value: object) -> float | None:
    """'123s' / '123.4s' as used by the Routes API, in seconds."""
    if isinstance(value, str) and value.endswith("s"):
        try:
            return float(value[:-1])
        except ValueError:
            return None
    return None


def _waypoint(lat: float, lon: float) -> dict[str, object]:
    return {"waypoint": {"location": {"latLng": {"latitude": lat, "longitude": lon}}}}


def _query(
    client: httpx.Client,
    coords: np.ndarray,
    origin: int,
    dests: list[int],
) -> dict[tuple[int, int], float]:
    body = {
        "origins": [_waypoint(*coords[origin])],
        "destinations": [_waypoint(*coords[d]) for d in dests],
        "travelMode": "DRIVE",
        # Without a departureTime the Routes API uses now: live traffic.
        "routingPreference": "TRAFFIC_AWARE",
    }
    resp = client.post(ROUTES_MATRIX_URL, json=body)
    if resp.status_code != 200:
        detail = resp.text[:300]
        raise TrafficUnavailable(f"Routes API menolak permintaan ({resp.status_code}): {detail}")
    out: dict[tuple[int, int], float] = {}
    for el in resp.json():
        if el.get("condition") != "ROUTE_EXISTS":
            continue
        live = _seconds(el.get("duration"))
        free = _seconds(el.get("staticDuration"))
        if live is None or not free:
            continue
        j = dests[int(el.get("destinationIndex", 0))]
        out[(origin, j)] = float(np.clip(live / free, MIN_FACTOR, MAX_FACTOR))
    return out


def fetch_ratios(
    coords: np.ndarray,
    plan: dict[int, list[int]],
    api_key: str,
    transport: httpx.BaseTransport | None = None,
) -> dict[tuple[int, int], float]:
    """Traffic / free-flow ratio per queried leg. `coords` is (n, 2) of (lat, lon)."""
    headers = {"X-Goog-Api-Key": api_key, "X-Goog-FieldMask": FIELD_MASK}
    jobs = [
        (origin, dests[i : i + MAX_DESTINATIONS])
        for origin, dests in plan.items()
        for i in range(0, len(dests), MAX_DESTINATIONS)
    ]
    ratios: dict[tuple[int, int], float] = {}
    with httpx.Client(headers=headers, timeout=REQUEST_TIMEOUT_S, transport=transport) as client:
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            for part in pool.map(lambda job: _query(client, coords, *job), jobs):
                ratios.update(part)
    return ratios


# --- From legs to the whole matrix -----------------------------------------------


def node_factors(n_total: int, ratios: dict[tuple[int, int], float], time_matrix: np.ndarray) -> np.ndarray:
    """Congestion factor per node: the median over its sampled legs."""
    per_node: list[list[float]] = [[] for _ in range(n_total)]
    for (i, j), r in ratios.items():
        per_node[i].append(r)
        per_node[j].append(r)
    factors = np.full(n_total, np.nan)
    for k, rs in enumerate(per_node):
        if rs:
            factors[k] = float(np.median(rs))
    known = np.where(~np.isnan(factors))[0]
    if len(known) == 0:
        return np.ones(n_total)
    for k in np.where(np.isnan(factors))[0]:
        # Borrow from the three nearest nodes that were measured.
        near = known[np.argsort(time_matrix[k, known])[:3]]
        factors[k] = float(np.median(factors[near]))
    return np.clip(factors, MIN_FACTOR, MAX_FACTOR)


def apply_traffic(time_matrix: np.ndarray, snapshot: TrafficSnapshot) -> np.ndarray:
    """The travel-time matrix under the snapshot's traffic."""
    f = snapshot.factors
    adjusted = time_matrix * np.sqrt(np.outer(f, f))
    for (i, j), r in snapshot.ratios.items():
        adjusted[i, j] = time_matrix[i, j] * r
    np.fill_diagonal(adjusted, 0.0)
    return adjusted


# --- Cached snapshots ------------------------------------------------------------

_cache: dict[str, tuple[float, TrafficSnapshot]] = {}
_lock = threading.Lock()


def snapshot_for(
    key: str,
    coords: np.ndarray,
    time_matrix: np.ndarray,
    n_depots: int,
    n_floods: int,
    dispatch_limit_s: float,
) -> TrafficSnapshot:
    """The current traffic for a node set, from cache while it is fresh."""
    if not configured():
        raise TrafficUnavailable(
            "Lalu lintas langsung belum dikonfigurasi: isi GOOGLE_MAPS_API_KEY di backend."
        )
    now = time.monotonic()
    with _lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < config.TRAFFIC_CACHE_TTL_S:
            return hit[1]

    plan = sample_pairs(time_matrix, n_depots, n_floods, dispatch_limit_s, config.TRAFFIC_MAX_ELEMENTS)
    requested = sum(len(v) for v in plan.values())
    try:
        ratios = fetch_ratios(coords, plan, config.GOOGLE_MAPS_API_KEY)
    except httpx.HTTPError as exc:
        raise TrafficUnavailable(f"Routes API tidak bisa dihubungi: {exc}") from exc
    if not ratios:
        raise TrafficUnavailable("Routes API tidak mengembalikan waktu tempuh untuk ruas yang diminta.")

    snap = TrafficSnapshot(
        factors=node_factors(time_matrix.shape[0], ratios, time_matrix),
        ratios=ratios,
        fetched_at=datetime.now(timezone.utc),
        requested_pairs=requested,
    )
    _log.info(
        "Traffic snapshot %s: %d/%d legs, mean x%.2f, max x%.2f",
        key, snap.sampled_pairs, requested, snap.mean_factor, snap.max_factor,
    )
    with _lock:
        _cache[key] = (now, snap)
    return snap


def clear_cache() -> None:
    with _lock:
        _cache.clear()
