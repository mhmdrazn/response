"""Live traffic: scale the precomputed travel times by current congestion.

Source: TomTom's Traffic Flow Segment Data API. For a point it returns the road
segment there with its travel time now and at free flow; their ratio is the
congestion at that point. (The TomTom routing and matrix APIs would give it per
leg, but the project key is licensed for the Traffic products only.)

The points asked about are the ones a plan drives through: every flood, every
depot that may dispatch to one, and each flood's nearest outlets. Each sampled
node gets a factor (ratio shrunk towards 1 by TomTom's confidence), nodes not
sampled borrow from their nearest sampled neighbours, and the OSRM time of a
leg i -> j is scaled by sqrt(f_i * f_j).

Only the blank canvas uses this: the study areas are recorded events and keep
the precomputed OSRM times.

One point is one request. TomTom's free tier for Flow Segment Data is 20,000 a
month, so a refresh is capped (TRAFFIC_MAX_POINTS), reused for
TRAFFIC_CACHE_TTL_S, and all refreshes together stop at a daily cap
(TOMTOM_FLOW_DAILY_LIMIT) kept in memory and in a file in the temp folder.
"""

from __future__ import annotations

import json
import logging
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import httpx
import numpy as np

from app import config

_log = logging.getLogger("response.traffic")

FLOW_URL = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/{zoom}/json"
# Map zoom TomTom uses to pick the segment: at 12 a point snaps to the
# collector/arterial road around it, which is what the legs mostly drive on.
FLOW_ZOOM = 12
K_OUTLETS = 2
# A ratio outside this band is a data quirk (a closure, a detour), not traffic.
MIN_FACTOR, MAX_FACTOR = 1.0, 4.0
REQUEST_TIMEOUT_S = 15.0
WORKERS = 8
USAGE_FILE = Path(tempfile.gettempdir()) / "response-tomtom-flow-usage.json"


class TrafficUnavailable(RuntimeError):
    """Traffic was asked for but could not be used; the message is for the user."""


@dataclass
class TrafficSnapshot:
    factors: np.ndarray                 # per node, aligned to the node space
    measured: dict[int, float]          # sampled node -> its congestion factor
    fetched_at: datetime
    requested_points: int
    sampled_points: int = field(init=False)

    def __post_init__(self) -> None:
        self.sampled_points = len(self.measured)

    @property
    def mean_factor(self) -> float:
        return float(np.mean(list(self.measured.values()))) if self.measured else 1.0

    @property
    def max_factor(self) -> float:
        return float(max(self.measured.values())) if self.measured else 1.0


def configured() -> bool:
    return bool(config.TOMTOM_API_KEY)


# --- Which points to ask about -------------------------------------------------


def sample_nodes(
    time_matrix: np.ndarray,
    n_depots: int,
    n_floods: int,
    dispatch_limit_s: float,
    budget: int,
) -> list[int]:
    """Nodes to query, most useful first, at most `budget` of them."""
    n_total = time_matrix.shape[0]
    depots = list(range(n_depots))
    floods = list(range(n_depots, n_depots + n_floods))
    outlets = list(range(n_depots + n_floods, n_total))

    wanted: list[int] = list(floods)
    # Depots that may dispatch: in range of some flood, or the nearest to one out of range.
    for f in floods:
        reach = [d for d in depots if time_matrix[d, f] <= dispatch_limit_s]
        wanted += reach or [min(depots, key=lambda d: time_matrix[d, f])]
    # Each flood's nearest outlets: every tank is emptied there.
    for f in floods:
        wanted += sorted(outlets, key=lambda o: time_matrix[f, o])[:K_OUTLETS]

    out: list[int] = []
    seen: set[int] = set()
    for n in wanted:
        if n in seen:
            continue
        seen.add(n)
        out.append(n)
        if len(out) >= budget:
            break
    return out


# --- Asking TomTom ---------------------------------------------------------------


def _query(client: httpx.Client, lat: float, lon: float, api_key: str) -> float | None:
    """Congestion factor of the road at (lat, lon), or None if TomTom has no segment."""
    resp = client.get(
        FLOW_URL.format(zoom=FLOW_ZOOM),
        params={"point": f"{lat},{lon}", "unit": "KMPH", "key": api_key},
    )
    if resp.status_code in (401, 403, 429):
        raise TrafficUnavailable(
            f"TomTom Traffic Flow menolak permintaan ({resp.status_code}): {resp.text[:200]}"
        )
    if resp.status_code != 200:
        return None  # no road nearby, or a passing error: this point is skipped
    seg = resp.json().get("flowSegmentData") or {}
    now, free = seg.get("currentTravelTime"), seg.get("freeFlowTravelTime")
    if not now or not free:
        return None
    ratio = float(np.clip(float(now) / float(free), MIN_FACTOR, MAX_FACTOR))
    # Low confidence means TomTom is mostly guessing from history: lean on free flow.
    confidence = float(np.clip(float(seg.get("confidence", 1.0)), 0.0, 1.0))
    return 1.0 + confidence * (ratio - 1.0)


def fetch_factors(
    coords: np.ndarray,
    nodes: list[int],
    api_key: str,
    transport: httpx.BaseTransport | None = None,
) -> dict[int, float]:
    """Congestion factor per queried node. `coords` is (n, 2) of (lat, lon)."""
    out: dict[int, float] = {}
    with httpx.Client(timeout=REQUEST_TIMEOUT_S, transport=transport) as client:
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            results = pool.map(
                lambda n: (n, _query(client, float(coords[n][0]), float(coords[n][1]), api_key)),
                nodes,
            )
            for n, factor in results:
                if factor is not None:
                    out[n] = factor
    return out


# --- From points to the whole matrix ---------------------------------------------


def node_factors(n_total: int, measured: dict[int, float], time_matrix: np.ndarray) -> np.ndarray:
    """A factor for every node: measured ones as they are, others from their neighbours."""
    factors = np.full(n_total, np.nan)
    for k, f in measured.items():
        factors[k] = f
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
    np.fill_diagonal(adjusted, 0.0)
    return adjusted


# --- Daily cap -------------------------------------------------------------------

_usage_lock = threading.Lock()
_usage: dict[str, object] | None = None


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _load_usage() -> dict[str, object]:
    global _usage
    if _usage is None:
        try:
            _usage = json.loads(USAGE_FILE.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            _usage = {"day": _today(), "count": 0}
    if _usage.get("day") != _today():
        _usage = {"day": _today(), "count": 0}
    return _usage


def usage_today() -> int:
    with _usage_lock:
        return int(_load_usage()["count"])


def _reserve(n: int) -> None:
    """Books n requests against today's cap, or refuses if they do not fit."""
    with _usage_lock:
        u = _load_usage()
        used = int(u["count"])
        if used + n > config.TOMTOM_FLOW_DAILY_LIMIT:
            raise TrafficUnavailable(
                "Batas harian lalu lintas TomTom tercapai "
                f"({used}/{config.TOMTOM_FLOW_DAILY_LIMIT} titik); rute memakai waktu normal."
            )
        u["count"] = used + n
        try:
            USAGE_FILE.write_text(json.dumps(u), encoding="utf-8")
        except OSError:
            pass  # the in-memory count still holds for this process


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
            "Lalu lintas langsung belum dikonfigurasi: isi TOMTOM_API_KEY di backend."
        )
    now = time.monotonic()
    with _lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < config.TRAFFIC_CACHE_TTL_S:
            return hit[1]

    nodes = sample_nodes(time_matrix, n_depots, n_floods, dispatch_limit_s, config.TRAFFIC_MAX_POINTS)
    _reserve(len(nodes))
    try:
        measured = fetch_factors(coords, nodes, config.TOMTOM_API_KEY)
    except httpx.HTTPError as exc:
        raise TrafficUnavailable(f"TomTom Traffic Flow tidak bisa dihubungi: {exc}") from exc
    if not measured:
        raise TrafficUnavailable("TomTom tidak mengembalikan data lalu lintas untuk titik yang diminta.")

    snap = TrafficSnapshot(
        factors=node_factors(time_matrix.shape[0], measured, time_matrix),
        measured=measured,
        fetched_at=datetime.now(timezone.utc),
        requested_points=len(nodes),
    )
    _log.info(
        "Traffic snapshot %s: %d/%d points, mean x%.2f, max x%.2f",
        key, snap.sampled_points, len(nodes), snap.mean_factor, snap.max_factor,
    )
    with _lock:
        _cache[key] = (now, snap)
    return snap


def clear_cache() -> None:
    with _lock:
        _cache.clear()
