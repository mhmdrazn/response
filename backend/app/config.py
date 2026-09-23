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

# --- Surabaya bounding box (data cleaning) -------------------------------
SBY_LAT_MIN, SBY_LAT_MAX = -7.38, -7.13
SBY_LON_MIN, SBY_LON_MAX = 112.58, 112.87

# --- CORS ----------------------------------------------------------------
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
CORS_ORIGIN_REGEX = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"
