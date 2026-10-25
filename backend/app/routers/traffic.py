from __future__ import annotations

from fastapi import APIRouter

from app import config
from app.traffic import live as traffic

router = APIRouter(prefix="/api/traffic", tags=["traffic"])


@router.get("/status")
async def traffic_status() -> dict[str, object]:
    """Whether canvas runs can plan with live traffic, and what it may cost."""
    return {
        "configured": traffic.configured(),
        "provider": "tomtom",
        "max_points": config.TRAFFIC_MAX_POINTS,
        "cache_ttl_s": config.TRAFFIC_CACHE_TTL_S,
        "daily_limit": config.TOMTOM_FLOW_DAILY_LIMIT,
        "used_today": traffic.usage_today(),
    }
