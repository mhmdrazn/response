from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.data import registry
from app.data.store import store
from app.models.severity import (
    SeverityFloodPoint,
    SeverityIndexResponse,
    SeverityWeights,
)
from app.severity.index import CRITERIA, compute_severity_index

router = APIRouter(tags=["severity"])


@router.get("/api/severity-index", response_model=SeverityIndexResponse)
async def get_severity_index(
    scenario: str | None = Query(default=None),
) -> SeverityIndexResponse:
    try:
        bundle = store.get(scenario)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Skenario '{scenario}' tidak ditemukan.")
    if registry.default_id() == "" and len(bundle.floods) == 0:
        raise HTTPException(status_code=503, detail="Dataset 'floods' belum dimuat.")

    result = compute_severity_index(bundle.floods, bundle.faskes)
    return SeverityIndexResponse(
        weights=SeverityWeights(
            criteria=CRITERIA,
            ahp=result.weights_ahp.tolist(),
            ew=result.weights_ew.tolist(),
            combined=result.weights_combined.tolist(),
            consistency_ratio=result.consistency_ratio,
        ),
        flood_points=[
            SeverityFloodPoint(
                id=str(row["id"]),
                si_value=float(row["si_value"]),
                depth_cm=float(row["depth_cm"]),
                road_class=float(row["road_class"]),
                dist_faskes_m=float(row["dist_faskes_m"]),
            )
            for row in result.per_point
        ],
    )
