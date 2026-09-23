from __future__ import annotations

from fastapi import APIRouter

from app.data import registry
from app.models.scenario import ScenarioList

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])


@router.get("", response_model=ScenarioList)
async def list_scenarios() -> ScenarioList:
    metas, default = registry.load_manifest()
    return ScenarioList(default=default, scenarios=metas)
