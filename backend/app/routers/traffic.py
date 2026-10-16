from __future__ import annotations

from fastapi import APIRouter

from app import config
from app.traffic import live as traffic

router = APIRouter(prefix="/api/traffic", tags=["traffic"])


@router.get("/status")
async def traffic_status() -> dict[str, object]:
    """Whether runs can plan with live traffic, and what one refresh may cost."""
    return {
        "routes_api_configured": traffic.configured(),
        "max_elements": config.TRAFFIC_MAX_ELEMENTS,
        "cache_ttl_s": config.TRAFFIC_CACHE_TTL_S,
    }
