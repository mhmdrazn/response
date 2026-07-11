from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import data as data_router
from app.routers import optimize as optimize_router
from app.routers import severity as severity_router

DATA_DIR = Path(__file__).parent / "data"

SBY_LAT_MIN, SBY_LAT_MAX = -7.38, -7.13
SBY_LON_MIN, SBY_LON_MAX = 112.58, 112.87


def _fix_longitude(val: float) -> float:
    """Repair common data-entry errors where the decimal point is missing."""
    if val > 1000:
        s = str(int(round(val)))
        if s.startswith("112"):
            return float(s[:3] + "." + s[3:])
    return val


def _bbox_filter(df: pd.DataFrame, label: str) -> pd.DataFrame:
    """Drop rows with lat/lon outside the Surabaya bounding box."""
    mask = (
        (df["lat"] >= SBY_LAT_MIN)
        & (df["lat"] <= SBY_LAT_MAX)
        & (df["lon"] >= SBY_LON_MIN)
        & (df["lon"] <= SBY_LON_MAX)
    )
    n_dropped = int((~mask).sum())
    if n_dropped > 0:
        import logging
        logging.getLogger("response.data").warning(
            "%s: dropped %d row(s) outside Surabaya bbox", label, n_dropped,
        )
    return df[mask].reset_index(drop=True)


def _load_floods(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df = df.rename(
        columns={
            "Datetime": "datetime",
            "Latitude": "lat",
            "Longitude": "lon",
            "Deskripsi": "deskripsi",
            "Images": "images",
            "Ketinggian (cm)": "ketinggian_cm",
        }
    )
    df["ketinggian_cm"] = pd.to_numeric(df["ketinggian_cm"], errors="coerce")
    df["lat"] = pd.to_numeric(df["lat"], errors="coerce")
    df["lon"] = pd.to_numeric(df["lon"], errors="coerce")
    df = df.dropna(subset=["lat", "lon"]).reset_index(drop=True)
    df["lon"] = df["lon"].apply(_fix_longitude)
    df = _bbox_filter(df, "floods")
    df.insert(0, "id", [f"F_{i:04d}" for i in range(len(df))])
    return df


def _load_depots(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df = df.rename(columns={"addr:city": "city"})
    df["lat"] = pd.to_numeric(df["lat"], errors="coerce")
    df["lon"] = pd.to_numeric(df["lon"], errors="coerce")
    df = df.dropna(subset=["lat", "lon"]).reset_index(drop=True)
    df = _bbox_filter(df, "depots")
    df["id"] = ["D_" + str(x) for x in df["osm_id"].astype(str)]
    return df


def _load_ifs(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df = df.rename(columns={"latitude": "lat", "longitude": "lon"})
    df["lat"] = pd.to_numeric(df["lat"], errors="coerce")
    df["lon"] = pd.to_numeric(df["lon"], errors="coerce")
    df = df.dropna(subset=["lat", "lon"]).reset_index(drop=True)
    df = _bbox_filter(df, "ifs")
    return df


def _load_faskes(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df = df.rename(columns={"addr:street": "street"})
    df["id"] = ["H_" + str(x) for x in df["osm_id"].astype(str)]
    return df


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load all static datasets once at startup."""
    import app.data as data

    if (DATA_DIR / "floods.csv").exists():
        data.flood_points = _load_floods(DATA_DIR / "floods.csv")
    if (DATA_DIR / "depo.csv").exists():
        data.depots = _load_depots(DATA_DIR / "depo.csv")
    if (DATA_DIR / "if.csv").exists():
        data.ifs = _load_ifs(DATA_DIR / "if.csv")
    if (DATA_DIR / "faskes.csv").exists():
        data.faskes = _load_faskes(DATA_DIR / "faskes.csv")
    if (DATA_DIR / "distance_matrix.npy").exists():
        data.distance_matrix = np.load(DATA_DIR / "distance_matrix.npy")
    if (DATA_DIR / "time_matrix.npy").exists():
        data.time_matrix = np.load(DATA_DIR / "time_matrix.npy")

    yield


app = FastAPI(title="Response API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(data_router.router)
app.include_router(severity_router.router)
app.include_router(optimize_router.router)


@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "response-api"}
