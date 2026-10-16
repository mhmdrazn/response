from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.data import canvas, registry
from app.models.scenario import ScenarioList

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])


@router.get("", response_model=ScenarioList)
async def list_scenarios() -> ScenarioList:
    metas, default = registry.load_manifest()
    return ScenarioList(default=default, scenarios=metas)


@router.post("/{scenario_id}/reset", status_code=204)
async def reset_scenario(scenario_id: str) -> None:
    """Empties the blank canvas. The study areas are recorded events and cannot be reset."""
    if not canvas.is_canvas(scenario_id):
        raise HTTPException(
            status_code=403, detail="Hanya kanvas baru yang bisa dikosongkan; area studi tetap."
        )
    canvas.reset()
