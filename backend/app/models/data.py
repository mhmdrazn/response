"""Pydantic response models for the /api/data/* endpoints.

Fields mirror the actual CSV columns after normalization in
``app.main._load_*``. Optional fields tolerate missing values in the raw
data (e.g. depots without an OSM city tag).
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator

SBY_LAT_MIN, SBY_LAT_MAX = -7.38, -7.13
SBY_LON_MIN, SBY_LON_MAX = 112.58, 112.87


class _Base(BaseModel):
    model_config = ConfigDict(extra="ignore")


class FloodPoint(_Base):
    id: str
    lat: float
    lon: float
    datetime: Optional[str] = None
    deskripsi: Optional[str] = None
    ketinggian_cm: Optional[float] = None


class Depot(_Base):
    id: str
    osm_id: int
    lat: float
    lon: float
    name: Optional[str] = None
    city: Optional[str] = None
    type: Optional[str] = None


class IntermediateFacility(_Base):
    id: str
    lat: float
    lon: float
    waterway_name: Optional[str] = None
    waterway_type: Optional[str] = None
    highway_name: Optional[str] = None
    highway_type: Optional[str] = None
    distance_to_water_m: Optional[float] = None
    n_source_points: Optional[int] = None


class Faskes(_Base):
    id: str
    osm_id: int
    lat: float
    lon: float
    name: Optional[str] = None
    amenity: Optional[str] = None
    street: Optional[str] = None
    healthcare: Optional[str] = None
    type: Optional[str] = None


# ---- Create / Update input models ----


class _CoordMixin:
    @field_validator("lat")
    @classmethod
    def _validate_lat(cls, v: float) -> float:
        if v < SBY_LAT_MIN or v > SBY_LAT_MAX:
            raise ValueError(
                f"lat {v} di luar batas Surabaya [{SBY_LAT_MIN}, {SBY_LAT_MAX}]"
            )
        return v

    @field_validator("lon")
    @classmethod
    def _validate_lon(cls, v: float) -> float:
        if v < SBY_LON_MIN or v > SBY_LON_MAX:
            raise ValueError(
                f"lon {v} di luar batas Surabaya [{SBY_LON_MIN}, {SBY_LON_MAX}]"
            )
        return v


class FloodPointCreate(_CoordMixin, _Base):
    lat: float
    lon: float
    datetime: Optional[str] = None
    deskripsi: Optional[str] = None
    ketinggian_cm: Optional[float] = None


class FloodPointUpdate(_Base):
    lat: Optional[float] = None
    lon: Optional[float] = None
    datetime: Optional[str] = None
    deskripsi: Optional[str] = None
    ketinggian_cm: Optional[float] = None


class DepotCreate(_CoordMixin, _Base):
    osm_id: int
    lat: float
    lon: float
    name: Optional[str] = None
    city: Optional[str] = None
    type: Optional[str] = None


class DepotUpdate(_Base):
    osm_id: Optional[int] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    name: Optional[str] = None
    city: Optional[str] = None
    type: Optional[str] = None


class IFCreate(_CoordMixin, _Base):
    lat: float
    lon: float
    waterway_name: Optional[str] = None
    waterway_type: Optional[str] = None
    highway_name: Optional[str] = None
    highway_type: Optional[str] = None
    distance_to_water_m: Optional[float] = None
    n_source_points: Optional[int] = None


class IFUpdate(_Base):
    lat: Optional[float] = None
    lon: Optional[float] = None
    waterway_name: Optional[str] = None
    waterway_type: Optional[str] = None
    highway_name: Optional[str] = None
    highway_type: Optional[str] = None
    distance_to_water_m: Optional[float] = None
    n_source_points: Optional[int] = None


class FaskesCreate(_CoordMixin, _Base):
    osm_id: int
    lat: float
    lon: float
    name: Optional[str] = None
    amenity: Optional[str] = None
    street: Optional[str] = None
    healthcare: Optional[str] = None
    type: Optional[str] = None


class FaskesUpdate(_Base):
    osm_id: Optional[int] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    name: Optional[str] = None
    amenity: Optional[str] = None
    street: Optional[str] = None
    healthcare: Optional[str] = None
    type: Optional[str] = None
