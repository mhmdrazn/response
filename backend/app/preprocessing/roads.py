"""Road classification (indicator C2). Fetch the Surabaya road network from
OpenStreetMap once, cache it, then map each flood point to a road-class ordinal
(1..5) by taking the highest-ordinal road within a search radius. Ported NB4.
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any

import pandas as pd

if TYPE_CHECKING:  # heavy geo deps are imported lazily inside functions
    import geopandas as gpd

from app.config import (
    CACHE_DIR,
    CRS_UTM49S,
    CRS_WGS84,
    HIGHWAY_ORDINAL,
    OVERPASS_ENDPOINTS,
    ROAD_CACHE,
    ROAD_SEARCH_RADIUS_M,
    SBY_LAT_MAX,
    SBY_LAT_MIN,
    SBY_LON_MAX,
    SBY_LON_MIN,
    USER_AGENT,
)


def _fetch_overpass(query: str, max_retries: int = 3, wait_s: int = 30) -> dict:
    import httpx

    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    last: Any = None
    for endpoint in OVERPASS_ENDPOINTS:
        for _ in range(max_retries):
            try:
                r = httpx.post(endpoint, data={"data": query}, headers=headers, timeout=180)
                last = r
                if r.status_code == 200:
                    return r.json()
            except httpx.HTTPError:
                pass
            time.sleep(wait_s)
    if last is not None:
        last.raise_for_status()
    raise RuntimeError("All Overpass endpoints failed")


def build_road_network() -> "gpd.GeoDataFrame":
    """Fetch every mapped highway in the Surabaya bbox, project to UTM, attach
    the road-class ordinal, and cache to disk. Slow (~80k ways); run once."""
    import geopandas as gpd
    from shapely.geometry import LineString

    types = "|".join(HIGHWAY_ORDINAL)
    query = (
        f"[out:json][timeout:180];"
        f'(way["highway"~"^({types})$"]'
        f"({SBY_LAT_MIN},{SBY_LON_MIN},{SBY_LAT_MAX},{SBY_LON_MAX}););"
        f"out geom tags;"
    )
    elements = _fetch_overpass(query)["elements"]
    rows = [
        {
            "highway_type": el.get("tags", {}).get("highway"),
            "geometry": LineString([(p["lon"], p["lat"]) for p in el["geometry"]]),
        }
        for el in elements
        if el.get("type") == "way" and len(el.get("geometry", [])) >= 2
    ]
    gdf = gpd.GeoDataFrame(rows, crs=CRS_WGS84)
    gdf["ordinal"] = gdf["highway_type"].map(HIGHWAY_ORDINAL)
    gdf = gdf.dropna(subset=["ordinal"]).to_crs(CRS_UTM49S).reset_index(drop=True)

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    gdf.to_pickle(ROAD_CACHE)
    return gdf


def load_road_network(refresh: bool = False) -> "gpd.GeoDataFrame":
    if not refresh and ROAD_CACHE.exists():
        return pd.read_pickle(ROAD_CACHE)  # unpickling a GeoDataFrame needs geopandas
    return build_road_network()


def classify_points(
    points: pd.DataFrame, roads_utm: "gpd.GeoDataFrame | None" = None
) -> list[int]:
    """Return a road_class ordinal for each row of `points` (needs lat/lon)."""
    import geopandas as gpd

    roads = roads_utm if roads_utm is not None else load_road_network()
    pts = gpd.GeoDataFrame(
        points, geometry=gpd.points_from_xy(points["lon"], points["lat"]), crs=CRS_WGS84
    ).to_crs(CRS_UTM49S)

    out: list[int] = []
    for geom in pts.geometry:
        within = roads[roads.intersects(geom.buffer(ROAD_SEARCH_RADIUS_M))]
        if len(within):
            out.append(int(within.loc[within["ordinal"].idxmax(), "ordinal"]))
        else:  # fallback: nearest road, any distance
            out.append(int(roads.loc[roads.distance(geom).idxmin(), "ordinal"]))
    return out
