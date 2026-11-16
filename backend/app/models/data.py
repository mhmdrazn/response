
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

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
    road_class: Optional[float] = None
    dist_faskes_m: Optional[float] = None
    # Pumping workload (litres) and the three factors it is built from, so the
    # UI can show how an estimate arises instead of only the figure.
    volume_l: Optional[float] = None
    road_width_m: Optional[float] = None
    ponding_length_m: Optional[float] = None
    effective_depth_cm: Optional[float] = None


class Depot(_Base):
    id: str
    osm_id: int
    lat: float
    lon: float
    name: Optional[str] = None
    address: Optional[str] = None
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


# Plausible bounds for what a person can enter by hand. Depth is the water over
# the road in cm; volume is the litres a crew would have to pump away.
MAX_DEPTH_CM = 300.0
MAX_VOLUME_L = 2_000_000.0


class FloodPointCreate(_CoordMixin, _Base):
    lat: float
    lon: float
    datetime: Optional[str] = None
    deskripsi: Optional[str] = Field(None, max_length=200)
    ketinggian_cm: Optional[float] = Field(None, ge=0, le=MAX_DEPTH_CM)
    # Overrides the estimate derived from depth and road width.
    volume_l: Optional[float] = Field(None, ge=0, le=MAX_VOLUME_L)


class CanvasLegs(_Base):
    """A canvas point's road legs to and from the depots and outlets.

    Worked out once when the point is placed and kept by the browser with it, so a
    run does not ask OSRM again (a serverless instance may be new). `key` names
    the depot/outlet set they were measured against; legs for another set are
    measured afresh.
    """

    key: str = Field(max_length=40)
    to_m: list[float] = Field(max_length=2000)
    from_m: list[float] = Field(max_length=2000)
    to_s: list[float] = Field(max_length=2000)
    from_s: list[float] = Field(max_length=2000)


class CanvasPoint(_CoordMixin, _Base):
    """A flood point as the browser holds it: on the blank canvas, or an edited study area.

    Edits are not stored on the server (see app.data.overlay), so requests that
    need them carry them, each point already enriched by POST /api/data/floods/enrich.
    """

    id: str = Field(min_length=1, max_length=40)
    lat: float
    lon: float
    datetime: Optional[str] = None
    deskripsi: Optional[str] = Field(None, max_length=200)
    ketinggian_cm: Optional[float] = Field(None, ge=0, le=MAX_DEPTH_CM)
    road_class: Optional[float] = None
    dist_faskes_m: Optional[float] = None
    volume_l: Optional[float] = Field(None, ge=0, le=MAX_VOLUME_L)
    legs: Optional[CanvasLegs] = None


class CanvasPointOut(FloodPoint):
    """An enriched canvas point, with the legs the browser keeps for later runs."""

    legs: Optional[CanvasLegs] = None


# A canvas is planned by hand: this many points is far past any real use.
MAX_CANVAS_POINTS = 300


class LocalDepot(_CoordMixin, Depot):
    pass


class LocalIF(_CoordMixin, IntermediateFacility):
    pass


class LocalFaskes(_CoordMixin, Faskes):
    pass


class DataOverrides(_Base):
    """Datasets the browser has edited, sent in place of the server's (see app.data.overlay).

    `floods` are the scenario's points (all of them, on the canvas always); the
    others are the full edited depot, outlet and clinic lists. A dataset left out
    is the server's own.
    """

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    floods: Optional[list[CanvasPoint]] = Field(None, max_length=MAX_CANVAS_POINTS)
    depo: Optional[list[LocalDepot]] = Field(None, max_length=500)
    ifs: Optional[list[LocalIF]] = Field(None, alias="if", max_length=3000)
    faskes: Optional[list[LocalFaskes]] = Field(None, max_length=5000)

    def as_rows(self) -> dict[str, list[dict]]:
        out: dict[str, list[dict]] = {}
        for key, rows in (("floods", self.floods), ("depo", self.depo), ("if", self.ifs), ("faskes", self.faskes)):
            if rows is not None:
                out[key] = [r.model_dump() for r in rows]
        return out


def overrides_rows(data: Optional[DataOverrides]) -> Optional[dict[str, list[dict]]]:
    return None if data is None else data.as_rows()


class CanvasEnrichRequest(_Base):
    point: FloodPointCreate
    # The scenario's other points, to refuse one dropped on top of an existing puddle.
    others: list[CanvasPoint] = Field(default_factory=list, max_length=MAX_CANVAS_POINTS)
    # Depots, outlets and clinics the browser has edited (its floods are ignored).
    data: Optional[DataOverrides] = None


class FloodPointUpdate(_Base):
    lat: Optional[float] = None
    lon: Optional[float] = None
    datetime: Optional[str] = None
    deskripsi: Optional[str] = Field(None, max_length=200)
    ketinggian_cm: Optional[float] = Field(None, ge=0, le=MAX_DEPTH_CM)
    volume_l: Optional[float] = Field(None, ge=0, le=MAX_VOLUME_L)


class DepotCreate(_CoordMixin, _Base):
    osm_id: int
    lat: float
    lon: float
    name: Optional[str] = None
    address: Optional[str] = None
    type: Optional[str] = None


class DepotUpdate(_Base):
    osm_id: Optional[int] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    name: Optional[str] = None
    address: Optional[str] = None
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
