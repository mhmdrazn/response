from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class _Base(BaseModel):
    model_config = ConfigDict(extra="ignore")


class SeverityWeights(_Base):
    criteria: list[str]
    ahp: list[float]
    ew: list[float]
    combined: list[float]
    consistency_ratio: float


class SeverityFloodPoint(_Base):
    id: str
    si_value: float
    depth_cm: float
    dist_faskes_m: float


class SeverityIndexResponse(_Base):
    weights: SeverityWeights
    flood_points: list[SeverityFloodPoint]
