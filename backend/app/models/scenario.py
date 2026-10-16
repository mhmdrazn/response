from __future__ import annotations

from pydantic import BaseModel


class ScenarioMeta(BaseModel):
    id: str
    name: str
    date_from: str | None = None
    date_to: str | None = None
    n_points: int | None = None
    description: str | None = None
    # "study": a recorded flood event. "canvas": starts empty, points placed by hand.
    kind: str = "study"


class ScenarioList(BaseModel):
    default: str
    scenarios: list[ScenarioMeta]
