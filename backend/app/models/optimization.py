from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class _Base(BaseModel):
    model_config = ConfigDict(extra="ignore")


class ACSRequest(_Base):
    iterations: int = Field(60, ge=1, le=500)
    n_ants: int = Field(20, ge=1, le=100)
    alpha: float = Field(1.0, ge=0.1, le=5.0)
    beta: float = Field(1.0, ge=0.1, le=10.0)
    rho: float = Field(0.15, ge=0.01, le=0.9)
    q0: float = Field(0.70, ge=0.0, le=1.0)
    seed: int | None = None
    time_limit_s: float | None = Field(45.0, ge=1.0, le=180.0)


class VNSRequest(_Base):
    max_iterations: int = Field(100, ge=1, le=1000)
    k_max: int = Field(3, ge=1, le=6)
    seed: int | None = None
    time_limit_s: float | None = Field(45.0, ge=1.0, le=180.0)


class VisitOut(_Base):
    node_id: str
    node_name: str
    node_type: Literal["depot", "flood", "if"]
    lat: float
    lon: float
    arrival_time_s: float
    tank_load_after_l: float
    volume_pumped_l: float


class RouteOut(_Base):
    vehicle_id: str
    depot_id: str
    depot_name: str
    capacity_l: int
    route_color_index: int
    total_distance_m: float
    total_time_s: float
    z_contribution: float
    visit_count_flood: int
    visit_count_if: int
    polyline: list[list[float]]  # [[lat, lon], ...] for map polyline
    visits: list[VisitOut]


class ConvergencePoint(_Base):
    iteration: int
    best_z: float
    iter_best_z: float


class OptimizationResponse(_Base):
    algorithm: Literal["acs", "vns"]
    routes: list[RouteOut]
    objective_z: float
    total_distance_m: float
    total_time_s: float
    total_if_visits: int
    total_flood_visits: int
    total_revisits: int
    computation_time_s: float
    convergence: list[ConvergencePoint]
    n_vehicles: int
