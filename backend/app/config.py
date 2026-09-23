"""Central configuration: filesystem layout, external services, geo bounds.

All paths and tunables live here so the rest of the app never hardcodes
locations. Override any value with an environment variable of the same name.
"""

from __future__ import annotations

import os
from pathlib import Path

_APP_DIR = Path(__file__).resolve().parent  # backend/app

# --- Data layout ---------------------------------------------------------
# files/
#   shared/      depo.csv, if.csv, faskes.csv        (constant across scenarios)
#   scenarios/   manifest.json + <id>/{floods.csv, distance_matrix.npy, time_matrix.npy}
#   sources/     raw inputs (spreadsheets, backups)
DATA_ROOT = Path(os.getenv("DATA_ROOT", str(_APP_DIR / "data" / "files")))
SHARED_DIR = DATA_ROOT / "shared"
SCENARIOS_DIR = DATA_ROOT / "scenarios"
MANIFEST_PATH = SCENARIOS_DIR / "manifest.json"
SOURCES_DIR = DATA_ROOT / "sources"
CACHE_DIR = DATA_ROOT / "cache"

# Offline pipeline inputs/caches
GEOCODED_MASTER = SOURCES_DIR / "damkar_geocoded.csv"  # all geocoded damkar points
ROAD_CACHE = CACHE_DIR / "roads_utm.pkl"               # cached Surabaya road network (UTM + ordinal)

SHARED_FILES = {
    "depo": SHARED_DIR / "depo.csv",
    "if": SHARED_DIR / "if.csv",
    "faskes": SHARED_DIR / "faskes.csv",
}


def scenario_dir(scenario_id: str) -> Path:
    return SCENARIOS_DIR / scenario_id


def scenario_floods_path(scenario_id: str) -> Path:
    return scenario_dir(scenario_id) / "floods.csv"


def scenario_matrix_paths(scenario_id: str) -> tuple[Path, Path]:
    d = scenario_dir(scenario_id)
    return d / "distance_matrix.npy", d / "time_matrix.npy"


# --- External services ---------------------------------------------------
OSRM_URL = os.getenv("OSRM_URL", "https://router.project-osrm.org")

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
USER_AGENT = "MDCVRP-IF-SI-TA/1.0 (student research; Surabaya flood pumping)"

# Coordinate reference systems for the preprocessing pipeline.
CRS_WGS84 = "EPSG:4326"
CRS_UTM49S = "EPSG:32749"

# Road highway tag -> ordinal 1..5 (indicator C2), highest = most critical.
HIGHWAY_ORDINAL = {
    "trunk": 5, "primary": 5, "secondary": 4, "tertiary": 3,
    "residential": 2, "service": 1, "living_street": 1,
}
ROAD_SEARCH_RADIUS_M = 100  # radius to attach a flood point to a road
FASKES_K_CANDIDATES = 5     # nearest faskes (Haversine) checked via OSRM
OSRM_BLOCK_SIZE = 40        # OSRM Table block size
EARTH_RADIUS_M = 6_371_000.0

# --- Surabaya bounding box (data cleaning) -------------------------------
SBY_LAT_MIN, SBY_LAT_MAX = -7.38, -7.13
SBY_LON_MIN, SBY_LON_MAX = 112.58, 112.87

# --- CORS ----------------------------------------------------------------
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
CORS_ORIGIN_REGEX = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"
