from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator


class _Base(BaseModel):
    model_config = ConfigDict(extra="ignore")


class SeverityWeights(_Base):
    criteria: list[str]
    ahp: list[float]
    ew: list[float]
    combined: list[float]
    consistency_ratio: float
    # "custom": `combined` are user-set weights; "default": the AHP + entropy mix.
    mode: Literal["default", "custom"] = "default"


class SeverityFloodPoint(_Base):
    id: str
    si_value: float
    depth_cm: float
    road_class: float
    dist_faskes_m: float


class SeverityPreviewRequest(_Base):
    """Weights for [flood depth, road class, distance to a clinic]; None = default."""

    weights: list[float] | None = None

    @field_validator("weights")
    @classmethod
    def _check(cls, v: list[float] | None) -> list[float] | None:
        if v is None:
            return v
        if len(v) != 3:
            raise ValueError("weights harus berisi 3 bobot")
        if any(w < 0 for w in v) or sum(v) <= 0:
            raise ValueError("bobot tidak boleh negatif dan jumlahnya harus lebih dari 0")
        return v


class SeverityIndexResponse(_Base):
    weights: SeverityWeights
    flood_points: list[SeverityFloodPoint]
