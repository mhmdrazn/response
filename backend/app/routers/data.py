"""Static data endpoints backing the frontend map layer, with CRUD support."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException

import app.data as data
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

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

_CSV_MAP: dict[str, str] = {
    "floods": "floods.csv",
    "depo": "depo.csv",
    "if": "if.csv",
    "faskes": "faskes.csv",
}


def _clean(value: Any) -> Any:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    return value


def _rows(df: pd.DataFrame | None, dataset: str) -> list[dict[str, Any]]:
    if df is None:
        raise HTTPException(
            status_code=503,
            detail=f"Dataset '{dataset}' belum dimuat. Cek file di backend/app/data/.",
        )
    records = df.to_dict(orient="records")
    return [{k: _clean(v) for k, v in r.items()} for r in records]


def _get_df(name: str) -> pd.DataFrame:
    mapping: dict[str, pd.DataFrame | None] = {
        "floods": data.flood_points,
        "depo": data.depots,
        "if": data.ifs,
        "faskes": data.faskes,
    }
    df = mapping.get(name)
    if df is None:
        raise HTTPException(status_code=503, detail=f"Dataset '{name}' belum dimuat.")
    return df


def _set_df(name: str, df: pd.DataFrame) -> None:
    if name == "floods":
        data.flood_points = df
    elif name == "depo":
        data.depots = df
    elif name == "if":
        data.ifs = df
    elif name == "faskes":
        data.faskes = df


def _save_csv(name: str) -> None:
    df = _get_df(name)
    path = DATA_DIR / _CSV_MAP[name]
    df.to_csv(path, index=False)


def _invalidate_matrices() -> None:
    data.distance_matrix = None
    data.time_matrix = None


def _find_row(df: pd.DataFrame, row_id: str, dataset: str) -> int:
    mask = df["id"] == row_id
    idxs = df.index[mask].tolist()
    if not idxs:
        raise HTTPException(status_code=404, detail=f"{dataset} id='{row_id}' tidak ditemukan.")
    return idxs[0]


# ──────────────────── READ ────────────────────

@router.get("/floods", response_model=list[FloodPoint])
async def get_floods() -> list[FloodPoint]:
    return [FloodPoint(**row) for row in _rows(data.flood_points, "floods")]


@router.get("/depo", response_model=list[Depot])
async def get_depots() -> list[Depot]:
    return [Depot(**row) for row in _rows(data.depots, "depo")]


@router.get("/if", response_model=list[IntermediateFacility])
async def get_intermediate_facilities() -> list[IntermediateFacility]:
    return [IntermediateFacility(**row) for row in _rows(data.ifs, "if")]


@router.get("/faskes", response_model=list[Faskes])
async def get_faskes() -> list[Faskes]:
    return [Faskes(**row) for row in _rows(data.faskes, "faskes")]


# ──────────────────── FLOODS CRUD ────────────────────

@router.post("/floods", response_model=FloodPoint, status_code=201)
async def create_flood(body: FloodPointCreate) -> FloodPoint:
    df = _get_df("floods")
    new_id = f"F_{len(df):04d}"
    row = {"id": new_id, **body.model_dump()}
    new_df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
    _set_df("floods", new_df)
    _save_csv("floods")
    _invalidate_matrices()
    return FloodPoint(**row)


@router.put("/floods/{flood_id}", response_model=FloodPoint)
async def update_flood(flood_id: str, body: FloodPointUpdate) -> FloodPoint:
    df = _get_df("floods")
    idx = _find_row(df, flood_id, "flood")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    for k, v in updates.items():
        df.at[idx, k] = v
    _set_df("floods", df)
    _save_csv("floods")
    row = {col: _clean(df.at[idx, col]) for col in df.columns}
    return FloodPoint(**row)


@router.delete("/floods/{flood_id}", status_code=204)
async def delete_flood(flood_id: str) -> None:
    df = _get_df("floods")
    idx = _find_row(df, flood_id, "flood")
    df = df.drop(idx).reset_index(drop=True)
    _set_df("floods", df)
    _save_csv("floods")
    _invalidate_matrices()


# ──────────────────── DEPOTS CRUD ────────────────────

@router.post("/depo", response_model=Depot, status_code=201)
async def create_depot(body: DepotCreate) -> Depot:
    df = _get_df("depo")
    new_id = f"D_{body.osm_id}"
    row = {"id": new_id, **body.model_dump()}
    new_df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
    _set_df("depo", new_df)
    _save_csv("depo")
    _invalidate_matrices()
    return Depot(**row)


@router.put("/depo/{depot_id}", response_model=Depot)
async def update_depot(depot_id: str, body: DepotUpdate) -> Depot:
    df = _get_df("depo")
    idx = _find_row(df, depot_id, "depot")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    for k, v in updates.items():
        df.at[idx, k] = v
    _set_df("depo", df)
    _save_csv("depo")
    row = {col: _clean(df.at[idx, col]) for col in df.columns}
    return Depot(**row)


@router.delete("/depo/{depot_id}", status_code=204)
async def delete_depot(depot_id: str) -> None:
    df = _get_df("depo")
    idx = _find_row(df, depot_id, "depot")
    df = df.drop(idx).reset_index(drop=True)
    _set_df("depo", df)
    _save_csv("depo")
    _invalidate_matrices()


# ──────────────────── IF CRUD ────────────────────

@router.post("/if", response_model=IntermediateFacility, status_code=201)
async def create_if(body: IFCreate) -> IntermediateFacility:
    df = _get_df("if")
    new_id = f"IF_{len(df):03d}"
    row = {"id": new_id, **body.model_dump()}
    new_df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
    _set_df("if", new_df)
    _save_csv("if")
    _invalidate_matrices()
    return IntermediateFacility(**row)


@router.put("/if/{if_id}", response_model=IntermediateFacility)
async def update_if(if_id: str, body: IFUpdate) -> IntermediateFacility:
    df = _get_df("if")
    idx = _find_row(df, if_id, "if")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    for k, v in updates.items():
        df.at[idx, k] = v
    _set_df("if", df)
    _save_csv("if")
    row = {col: _clean(df.at[idx, col]) for col in df.columns}
    return IntermediateFacility(**row)


@router.delete("/if/{if_id}", status_code=204)
async def delete_if(if_id: str) -> None:
    df = _get_df("if")
    idx = _find_row(df, if_id, "if")
    df = df.drop(idx).reset_index(drop=True)
    _set_df("if", df)
    _save_csv("if")
    _invalidate_matrices()


# ──────────────────── FASKES CRUD ────────────────────

@router.post("/faskes", response_model=Faskes, status_code=201)
async def create_faskes(body: FaskesCreate) -> Faskes:
    df = _get_df("faskes")
    new_id = f"H_{body.osm_id}"
    row = {"id": new_id, **body.model_dump()}
    new_df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
    _set_df("faskes", new_df)
    _save_csv("faskes")
    _invalidate_matrices()
    return Faskes(**row)


@router.put("/faskes/{faskes_id}", response_model=Faskes)
async def update_faskes(faskes_id: str, body: FaskesUpdate) -> Faskes:
    df = _get_df("faskes")
    idx = _find_row(df, faskes_id, "faskes")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    for k, v in updates.items():
        df.at[idx, k] = v
    _set_df("faskes", df)
    _save_csv("faskes")
    row = {col: _clean(df.at[idx, col]) for col in df.columns}
    return Faskes(**row)


@router.delete("/faskes/{faskes_id}", status_code=204)
async def delete_faskes(faskes_id: str) -> None:
    df = _get_df("faskes")
    idx = _find_row(df, faskes_id, "faskes")
    df = df.drop(idx).reset_index(drop=True)
    _set_df("faskes", df)
    _save_csv("faskes")
    _invalidate_matrices()
