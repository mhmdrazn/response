from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from app.config import SHARED_FILES, scenario_floods_path
from app.data import registry
from app.data.store import store
from app.models.data import (
    Depot,
    DepotCreate,
    DepotUpdate,
    Faskes,
    FaskesCreate,
    FaskesUpdate,
    FloodPoint,
    FloodPointCreate,
    FloodPointUpdate,
    IFCreate,
    IFUpdate,
    IntermediateFacility,
)

router = APIRouter(prefix="/api/data", tags=["data"])

# `?scenario=` selects the flood scenario; None => manifest default. Shared
# datasets (depo/if/faskes) are the same across scenarios.
ScenarioQuery = Query(default=None, description="Scenario id; default = manifest default")


def _sid(scenario: str | None) -> str:
    try:
        return registry.resolve(scenario)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Skenario '{scenario}' tidak ditemukan.")


def _dataset_path(sid: str, name: str) -> Path:
    return scenario_floods_path(sid) if name == "floods" else SHARED_FILES[name]


def _df(sid: str, name: str) -> pd.DataFrame:
    bundle = store.get(sid)
    return {
        "floods": bundle.floods,
        "depo": bundle.depots,
        "if": bundle.ifs,
        "faskes": bundle.faskes,
    }[name]


def _persist(sid: str, name: str, df: pd.DataFrame) -> None:
    df.to_csv(_dataset_path(sid, name), index=False)
    if name == "floods":
        store.invalidate(sid)
    else:
        store.invalidate_shared()


def _clean(value: Any) -> Any:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    return value


def _rows(df: pd.DataFrame) -> list[dict[str, Any]]:
    return [{k: _clean(v) for k, v in r.items()} for r in df.to_dict(orient="records")]


def _find_row(df: pd.DataFrame, row_id: str, dataset: str) -> int:
    idxs = df.index[df["id"] == row_id].tolist()
    if not idxs:
        raise HTTPException(status_code=404, detail=f"{dataset} id='{row_id}' tidak ditemukan.")
    return idxs[0]


# --- Freshness -----------------------------------------------------------


@router.get("/meta")
async def get_data_meta(scenario: str | None = ScenarioQuery) -> dict[str, dict[str, object]]:
    sid = _sid(scenario)
    bundle = store.get(sid)
    counts = {
        "floods": len(bundle.floods),
        "depo": len(bundle.depots),
        "if": len(bundle.ifs),
        "faskes": len(bundle.faskes),
    }
    meta: dict[str, dict[str, object]] = {}
    for name in ("floods", "depo", "if", "faskes"):
        path = _dataset_path(sid, name)
        updated = (
            datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()
            if path.exists()
            else None
        )
        meta[name] = {"updated_at": updated, "rows": counts[name]}
    return meta


# --- Reads ---------------------------------------------------------------


@router.get("/floods", response_model=list[FloodPoint])
async def get_floods(scenario: str | None = ScenarioQuery) -> list[FloodPoint]:
    return [FloodPoint(**row) for row in _rows(_df(_sid(scenario), "floods"))]


@router.get("/depo", response_model=list[Depot])
async def get_depots(scenario: str | None = ScenarioQuery) -> list[Depot]:
    return [Depot(**row) for row in _rows(_df(_sid(scenario), "depo"))]


@router.get("/if", response_model=list[IntermediateFacility])
async def get_intermediate_facilities(
    scenario: str | None = ScenarioQuery,
) -> list[IntermediateFacility]:
    return [IntermediateFacility(**row) for row in _rows(_df(_sid(scenario), "if"))]


@router.get("/faskes", response_model=list[Faskes])
async def get_faskes(scenario: str | None = ScenarioQuery) -> list[Faskes]:
    return [Faskes(**row) for row in _rows(_df(_sid(scenario), "faskes"))]


# --- CRUD helpers --------------------------------------------------------


def _create(sid: str, name: str, new_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    df = _df(sid, name)
    row = {"id": new_id, **payload}
    _persist(sid, name, pd.concat([df, pd.DataFrame([row])], ignore_index=True))
    return row


def _update(sid: str, name: str, row_id: str, label: str, payload: dict[str, Any]) -> dict[str, Any]:
    df = _df(sid, name).copy()
    idx = _find_row(df, row_id, label)
    for k, v in payload.items():
        if v is not None:
            df.at[idx, k] = v
    _persist(sid, name, df)
    return {col: _clean(df.at[idx, col]) for col in df.columns}


def _delete(sid: str, name: str, row_id: str, label: str) -> None:
    df = _df(sid, name)
    idx = _find_row(df, row_id, label)
    _persist(sid, name, df.drop(idx).reset_index(drop=True))


# --- Floods (per scenario) ----------------------------------------------


@router.post("/floods", response_model=FloodPoint, status_code=201)
async def create_flood(
    body: FloodPointCreate, scenario: str | None = ScenarioQuery
) -> FloodPoint:
    sid = _sid(scenario)
    new_id = f"F_{len(_df(sid, 'floods')):04d}"
    return FloodPoint(**_create(sid, "floods", new_id, body.model_dump()))


@router.put("/floods/{flood_id}", response_model=FloodPoint)
async def update_flood(
    flood_id: str, body: FloodPointUpdate, scenario: str | None = ScenarioQuery
) -> FloodPoint:
    return FloodPoint(**_update(_sid(scenario), "floods", flood_id, "flood", body.model_dump()))


@router.delete("/floods/{flood_id}", status_code=204)
async def delete_flood(flood_id: str, scenario: str | None = ScenarioQuery) -> None:
    _delete(_sid(scenario), "floods", flood_id, "flood")


# --- Depots (shared) -----------------------------------------------------


@router.post("/depo", response_model=Depot, status_code=201)
async def create_depot(body: DepotCreate, scenario: str | None = ScenarioQuery) -> Depot:
    return Depot(**_create(_sid(scenario), "depo", f"D_{body.osm_id}", body.model_dump()))


@router.put("/depo/{depot_id}", response_model=Depot)
async def update_depot(
    depot_id: str, body: DepotUpdate, scenario: str | None = ScenarioQuery
) -> Depot:
    return Depot(**_update(_sid(scenario), "depo", depot_id, "depot", body.model_dump()))


@router.delete("/depo/{depot_id}", status_code=204)
async def delete_depot(depot_id: str, scenario: str | None = ScenarioQuery) -> None:
    _delete(_sid(scenario), "depo", depot_id, "depot")


# --- Intermediate facilities (shared) ------------------------------------


@router.post("/if", response_model=IntermediateFacility, status_code=201)
async def create_if(body: IFCreate, scenario: str | None = ScenarioQuery) -> IntermediateFacility:
    sid = _sid(scenario)
    new_id = f"IF_{len(_df(sid, 'if')):03d}"
    return IntermediateFacility(**_create(sid, "if", new_id, body.model_dump()))


@router.put("/if/{if_id}", response_model=IntermediateFacility)
async def update_if(
    if_id: str, body: IFUpdate, scenario: str | None = ScenarioQuery
) -> IntermediateFacility:
    return IntermediateFacility(**_update(_sid(scenario), "if", if_id, "if", body.model_dump()))


@router.delete("/if/{if_id}", status_code=204)
async def delete_if(if_id: str, scenario: str | None = ScenarioQuery) -> None:
    _delete(_sid(scenario), "if", if_id, "if")


# --- Faskes (shared) -----------------------------------------------------


@router.post("/faskes", response_model=Faskes, status_code=201)
async def create_faskes(body: FaskesCreate, scenario: str | None = ScenarioQuery) -> Faskes:
    return Faskes(**_create(_sid(scenario), "faskes", f"H_{body.osm_id}", body.model_dump()))


@router.put("/faskes/{faskes_id}", response_model=Faskes)
async def update_faskes(
    faskes_id: str, body: FaskesUpdate, scenario: str | None = ScenarioQuery
) -> Faskes:
    return Faskes(**_update(_sid(scenario), "faskes", faskes_id, "faskes", body.model_dump()))


@router.delete("/faskes/{faskes_id}", status_code=204)
async def delete_faskes(faskes_id: str, scenario: str | None = ScenarioQuery) -> None:
    _delete(_sid(scenario), "faskes", faskes_id, "faskes")
