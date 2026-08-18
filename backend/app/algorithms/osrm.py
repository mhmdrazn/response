# OSRM road geometry for route visualization; Manhattan fallback on failure
# OSRM coordinates are lon,lat (not lat,lon)

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

import httpx

_log = logging.getLogger("response.osrm")

OSRM_BASE = "http://router.project-osrm.org"
OSRM_TIMEOUT_S = 5.0
MAX_WAYPOINTS_PER_REQUEST = 100
MAX_PARALLEL_REQUESTS = 4


def _chunk_waypoints(
    coords: list[tuple[float, float]], chunk_size: int
) -> list[list[tuple[float, float]]]:
    # Overlapping chunks keep segments connected
    if len(coords) <= chunk_size:
        return [coords]
    chunks: list[list[tuple[float, float]]] = []
    start = 0
    while start < len(coords) - 1:
        end = min(start + chunk_size, len(coords))
        chunks.append(coords[start:end])
        start = end - 1
    return chunks


_client: httpx.Client | None = None


def _get_client() -> httpx.Client:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.Client(
            timeout=OSRM_TIMEOUT_S,
            limits=httpx.Limits(max_connections=MAX_PARALLEL_REQUESTS),
        )
    return _client


def _fetch_chunk(chunk: list[tuple[float, float]]) -> list[list[float]] | None:
    coords_str = ";".join(f"{lon},{lat}" for lat, lon in chunk)
    url = (
        f"{OSRM_BASE}/route/v1/driving/{coords_str}"
        f"?overview=full&geometries=geojson&steps=false"
    )
    try:
        resp = _get_client().get(url)
        if resp.status_code != 200:
            _log.warning("OSRM returned %d for %d waypoints", resp.status_code, len(chunk))
            return None
        data = resp.json()
        if data.get("code") != "Ok" or not data.get("routes"):
            _log.warning("OSRM response code: %s", data.get("code"))
            return None
        geojson_coords = data["routes"][0]["geometry"]["coordinates"]
        return [[c[1], c[0]] for c in geojson_coords]
    except Exception as exc:
        _log.warning("OSRM chunk failed: %s", exc)
        return None


def _manhattan_fallback(waypoints: list[tuple[float, float]]) -> list[list[float]]:
    # L-shaped segments between consecutive waypoints (lat-first then lon)
    polyline: list[list[float]] = []
    for i, (lat, lon) in enumerate(waypoints):
        if i == 0:
            polyline.append([lat, lon])
            continue
        prev_lat, prev_lon = waypoints[i - 1]
        # Intermediate corner: move lat first, then lon
        polyline.append([lat, prev_lon])
        polyline.append([lat, lon])
    return polyline


def fetch_road_geometry(
    waypoints: list[tuple[float, float]],
) -> list[list[float]]:
    if len(waypoints) < 2:
        return [[lat, lon] for lat, lon in waypoints]

    chunks = _chunk_waypoints(waypoints, MAX_WAYPOINTS_PER_REQUEST)

    if len(chunks) == 1:
        result = _fetch_chunk(chunks[0])
        return result if result is not None else _manhattan_fallback(waypoints)

    results: list[list[list[float]] | None] = [None] * len(chunks)
    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_REQUESTS) as pool:
        futures = {pool.submit(_fetch_chunk, c): i for i, c in enumerate(chunks)}
        for future in as_completed(futures):
            idx = futures[future]
            results[idx] = future.result()

    full_geometry: list[list[float]] = []
    for segment in results:
        if segment is None:
            return _manhattan_fallback(waypoints)
        if full_geometry:
            segment = segment[1:]
        full_geometry.extend(segment)

    return full_geometry


def fetch_road_geometries_batch(
    waypoint_lists: list[list[tuple[float, float]]],
) -> list[list[list[float]]]:
    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_REQUESTS) as pool:
        return list(pool.map(fetch_road_geometry, waypoint_lists))
