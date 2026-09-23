from __future__ import annotations

from pydantic import BaseModel


class ScenarioMeta(BaseModel):
    id: str
    name: str
    date_from: str | None = None
    date_to: str | None = None
    n_points: int | None = None
    description: str | None = None


class ScenarioList(BaseModel):
    default: str
    scenarios: list[ScenarioMeta]
