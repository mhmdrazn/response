"""Pure CSV loaders: read a raw dataset file and return a normalized DataFrame.

Moved out of main.py so both the app (ScenarioStore) and the offline pipeline
can reuse them without importing FastAPI. No global state, no side effects.
"""

from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from app.config import (
    SBY_LAT_MAX,
    SBY_LAT_MIN,
    SBY_LON_MAX,
    SBY_LON_MIN,
)

_log = logging.getLogger("response.data")


def fix_longitude(val: float) -> float:
    # Repair a missing decimal point in longitude data-entry errors.
    if val > 1000:
        s = str(int(round(val)))
        if s.startswith("112"):
            return float(s[:3] + "." + s[3:])
    return val


def bbox_filter(df: pd.DataFrame, label: str) -> pd.DataFrame:
    mask = (
        df["lat"].between(SBY_LAT_MIN, SBY_LAT_MAX)
        & df["lon"].between(SBY_LON_MIN, SBY_LON_MAX)
    )
    dropped = int((~mask).sum())
    if dropped:
        _log.warning("%s: dropped %d row(s) outside Surabaya bbox", label, dropped)
    return df[mask].reset_index(drop=True)


def load_floods(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path).rename(
        columns={
            "Datetime": "datetime",
            "Latitude": "lat",
            "Longitude": "lon",
            "Deskripsi": "deskripsi",
            "Images": "images",
            "Ketinggian (cm)": "ketinggian_cm",
        }
    )
    for col in ("ketinggian_cm", "road_class", "dist_faskes_m", "volume_l", "lat", "lon"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["lat", "lon"]).reset_index(drop=True)
    df["lon"] = df["lon"].apply(fix_longitude)
    df = bbox_filter(df, "floods")
    df.insert(0, "id", [f"F_{i:04d}" for i in range(len(df))])
    return df


def load_depots(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path).rename(columns={"addr:city": "city"})
    df["lat"] = pd.to_numeric(df["lat"], errors="coerce")
    df["lon"] = pd.to_numeric(df["lon"], errors="coerce")
    df = df.dropna(subset=["lat", "lon"]).reset_index(drop=True)
    df = bbox_filter(df, "depots")
    df["id"] = ["D_" + str(x) for x in df["osm_id"].astype(str)]
    return df


def load_ifs(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path).rename(columns={"latitude": "lat", "longitude": "lon"})
    df["lat"] = pd.to_numeric(df["lat"], errors="coerce")
    df["lon"] = pd.to_numeric(df["lon"], errors="coerce")
    df = df.dropna(subset=["lat", "lon"]).reset_index(drop=True)
    return bbox_filter(df, "ifs")


def load_faskes(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path).rename(columns={"addr:street": "street"})
    df["id"] = ["H_" + str(x) for x in df["osm_id"].astype(str)]
    return df
