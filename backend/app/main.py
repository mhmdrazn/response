from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGIN_REGEX, CORS_ORIGINS
from app.data.store import store
from app.routers import data as data_router
from app.routers import optimize as optimize_router
from app.routers import scenarios as scenarios_router
from app.routers import severity as severity_router

_log = logging.getLogger("response")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm the default scenario so the first request is fast and any config/data
    # error surfaces at startup. Best-effort — a missing dataset must not block boot.
    try:
        store.get(None)
    except Exception as exc:  # noqa: BLE001
        _log.warning("Could not warm default scenario at startup: %s", exc)
    yield


app = FastAPI(title="Response API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(data_router.router)
app.include_router(severity_router.router)
app.include_router(optimize_router.router)
app.include_router(scenarios_router.router)


@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "response-api"}
