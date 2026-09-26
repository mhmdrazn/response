from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGIN_REGEX, CORS_ORIGINS
from app.data.store import store
from app.routers import data as data_router
from app.routers import optimize as optimize_router
from app.routers import scenarios as scenarios_router
from app.routers import severity as severity_router

_log = logging.getLogger("response")

STARTED_AT = datetime.now(timezone.utc)


def git_head() -> str | None:
    """Short commit of the checkout this process was started from.

    Read straight from .git rather than through a subprocess, so it costs
    nothing and works where git is not on PATH. None outside a checkout.
    """
    git_dir = Path(__file__).resolve().parents[2] / ".git"
    try:
        head = (git_dir / "HEAD").read_text(encoding="utf-8").strip()
        if not head.startswith("ref: "):
            return head[:7] or None

        ref_name = head[5:]
        ref_file = git_dir / ref_name
        if ref_file.exists():
            return ref_file.read_text(encoding="utf-8").strip()[:7] or None

        packed = git_dir / "packed-refs"
        for line in packed.read_text(encoding="utf-8").splitlines():
            if line.endswith(" " + ref_name):
                return line.split()[0][:7]
        return None
    except Exception:  # noqa: BLE001 — identity is a nicety, never a failure
        return None


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
async def health() -> dict[str, object]:
    """Liveness plus enough identity to tell a stale process from a fresh one.

    A uvicorn started without --reload keeps whatever code it loaded at boot,
    and a failed rebind leaves the old process answering as if nothing changed.
    `commit` and `started_at` say which snapshot is running; the workload fields
    say which data it actually loaded.
    """
    info: dict[str, object] = {
        "status": "ok",
        "service": "response-api",
        "commit": git_head(),
        "started_at": STARTED_AT.isoformat(),
    }
    try:
        bundle = store.get(None)
        volumes = bundle.floods.get("volume_l")
        info["scenario"] = bundle.scenario_id
        info["flood_points"] = int(len(bundle.floods))
        info["workload_source"] = (
            "calibrated" if volumes is not None and volumes.notna().any()
            else "depth-proxy"
        )
        info["demand_total_l"] = (
            round(float(volumes.sum()), 1) if volumes is not None else None
        )
    except Exception as exc:  # noqa: BLE001 — health must answer even without data
        info["scenario"] = None
        info["data_error"] = str(exc)
    return info
