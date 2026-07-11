"""GET /api/severity-index — AHP + Entropy Weight Severity Index per flood point."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

import app.data as data
from app.models.severity import (
    SeverityFloodPoint,
    SeverityIndexResponse,
    SeverityWeights,
)
from app.severity.index import CRITERIA, compute_severity_index

router = APIRouter(tags=["severity"])


@router.get("/api/severity-index", response_model=SeverityIndexResponse)
async def get_severity_index() -> SeverityIndexResponse:
    if data.flood_points is None:
        raise HTTPException(
            status_code=503,
            detail="Dataset 'floods' belum dimuat.",
        )
    if data.faskes is None:
        raise HTTPException(
            status_code=503,
            detail="Dataset 'faskes' belum dimuat.",
        )
    result = compute_severity_index(data.flood_points, data.faskes)
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
                dist_faskes_m=float(row["dist_faskes_m"]),
            )
            for row in result.per_point
        ],
    )
