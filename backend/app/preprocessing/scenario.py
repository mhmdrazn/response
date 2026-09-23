"""Build a scenario's flood-point set from the geocoded damkar master.

Filter by date range (or read a free CSV), combine date + time, and optionally
deduplicate coincident points (keep the worst-case depth). Ported from NB3/NB6.
"""

from __future__ import annotations

from math import atan2, cos, radians, sin, sqrt
from pathlib import Path

import pandas as pd

from app.config import GEOCODED_MASTER


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return r * 2 * atan2(sqrt(a), sqrt(1 - a))


def _combine_datetime(df: pd.DataFrame) -> pd.Series:
    # datetime = date part of `tanggal` + time part of `terima_berita`.
    tgl = pd.to_datetime(df.get("tanggal"), errors="coerce")
    tb = pd.to_datetime(df.get("terima_berita"), errors="coerce")
    tod = tb - tb.dt.normalize()
    return tgl.dt.normalize() + tod.fillna(pd.Timedelta(0))


def _normalize(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["lat"] = pd.to_numeric(df["lat"], errors="coerce")
    df["lon"] = pd.to_numeric(df["lon"], errors="coerce")
    df["depth_cm"] = pd.to_numeric(df.get("depth_cm"), errors="coerce")
    df = df.dropna(subset=["lat", "lon"]).reset_index(drop=True)
    df["datetime"] = _combine_datetime(df)
    return df


def deduplicate(df: pd.DataFrame, radius_m: float = 200.0) -> pd.DataFrame:
    """Merge points within `radius_m`, keeping the max depth (worst case)."""
    df = df.reset_index(drop=True)
    merged = [False] * len(df)
    out: list[pd.Series] = []
    for i in range(len(df)):
        if merged[i]:
            continue
        group = [i]
        for j in range(i + 1, len(df)):
            if merged[j]:
                continue
            if _haversine_m(df.at[i, "lat"], df.at[i, "lon"], df.at[j, "lat"], df.at[j, "lon"]) < radius_m:
                group.append(j)
                merged[j] = True
        rep = df.loc[group[0]].copy()
        rep["depth_cm"] = df.loc[group, "depth_cm"].max()
        out.append(rep)
    return pd.DataFrame(out).reset_index(drop=True)


def _finalize(df: pd.DataFrame, dedup: bool, radius_m: float) -> pd.DataFrame:
    df = _normalize(df)
    if dedup:
        df = deduplicate(df, radius_m)
    df.insert(0, "id", [f"F_{i:04d}" for i in range(len(df))])
    return df


def from_date_range(
    date_from: str, date_to: str, *, dedup: bool = True, radius_m: float = 200.0,
    master: Path = GEOCODED_MASTER,
) -> pd.DataFrame:
    df = pd.read_csv(master)
    d = pd.to_datetime(df["tanggal"], errors="coerce").dt.date
    lo = pd.to_datetime(date_from).date()
    hi = pd.to_datetime(date_to).date()
    sel = df[(d >= lo) & (d <= hi)].reset_index(drop=True)
    if len(sel) == 0:
        raise ValueError(f"No points in {date_from}..{date_to} within {master.name}")
    return _finalize(sel, dedup, radius_m)


def from_csv(path: Path, *, dedup: bool = False, radius_m: float = 200.0) -> pd.DataFrame:
    return _finalize(pd.read_csv(path), dedup, radius_m)
