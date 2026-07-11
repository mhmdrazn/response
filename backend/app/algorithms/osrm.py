"""Fetch road geometry from OSRM for route visualization.

Uses the public OSRM demo server to convert a sequence of waypoints
into an actual road-following polyline.  Falls back to straight lines
if the server is unreachable or returns an error.

OSRM accepts coordinates as ``lon,lat`` (not ``lat,lon``).
"""

from __future__ import annotations

import logging
from urllib.parse import quote

import httpx

_log = logging.getLogger("response.osrm")

OSRM_BASE = "http://router.project-osrm.org"
OSRM_TIMEOUT_S = 10.0
MAX_WAYPOINTS_PER_REQUEST = 100


def _chunk_waypoints(
    coords: list[tuple[float, float]], chunk_size: int
) -> list[list[tuple[float, float]]]:
    """Split waypoints into overlapping chunks so segments stay connected."""
    if len(coords) <= chunk_size:
        return [coords]
    chunks: list[list[tuple[float, float]]] = []
    start = 0
    while start < len(coords) - 1:
        end = min(start + chunk_size, len(coords))
        chunks.append(coords[start:end])
        start = end - 1
    return chunks


def fetch_road_geometry(
    waypoints: list[tuple[float, float]],
) -> list[list[float]] | None:
    """Get road-following polyline for a sequence of (lat, lon) waypoints.

    Returns [[lat, lon], ...] on success, or None on failure.
    """
    if len(waypoints) < 2:
        return None

    chunks = _chunk_waypoints(waypoints, MAX_WAYPOINTS_PER_REQUEST)
    full_geometry: list[list[float]] = []

    try:
        with httpx.Client(timeout=OSRM_TIMEOUT_S) as client:
            for chunk in chunks:
                coords_str = ";".join(
                    f"{lon},{lat}" for lat, lon in chunk
                )
                url = (
                    f"{OSRM_BASE}/route/v1/driving/{coords_str}"
                    f"?overview=full&geometries=geojson&steps=false"
                )
                resp = client.get(url)
                if resp.status_code != 200:
                    _log.warning(
                        "OSRM returned %d for %d waypoints",
                        resp.status_code,
                        len(chunk),
                    )
                    return None

                data = resp.json()
                if data.get("code") != "Ok" or not data.get("routes"):
                    _log.warning("OSRM response code: %s", data.get("code"))
                    return None

                geojson_coords = data["routes"][0]["geometry"]["coordinates"]
                segment = [[c[1], c[0]] for c in geojson_coords]

                if full_geometry:
                    segment = segment[1:]
                full_geometry.extend(segment)

    except Exception as exc:
        _log.warning("OSRM request failed: %s", exc)
        return None

    return full_geometry
