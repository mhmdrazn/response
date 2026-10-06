import numpy as np
import pandas as pd
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.algorithms.acs import ACSParams, HybridACS
from app.algorithms.evaluator import validate_hard_constraints
from app.algorithms.instance import DepotFleet, build_instance
from app.data.scenario_edit import DUPLICATE_RADIUS_M, _reject_duplicate
from app.models.data import FloodPointCreate
from app.models.optimization import ACSRequest, DepotFleetIn, TankUnits
from app.severity.index import compute_severity_index


def _instance(b, fleet=None, weights=None):
    sev = compute_severity_index(b.floods, b.faskes, weights=weights)
    return build_instance(
        depots_df=b.depots,
        floods_df=b.floods,
        ifs_df=b.ifs,
        dist_matrix=b.distance_matrix,
        time_matrix=b.time_matrix,
        si_values=sev.si_values,
        fleet=fleet,
    )


# --- fleet ------------------------------------------------------------------


def test_default_fleet_is_one_vehicle_per_tank_size_per_depot(s2):
    inst = _instance(s2)
    assert len(inst.vehicles) == 2 * inst.n_depots
    assert all(inst.horizon_of(k) == inst.route_horizon_s for k in range(len(inst.vehicles)))


def test_custom_fleet_sets_units_capacities_and_shift(s2):
    first = str(s2.depots.iloc[0]["id"])
    second = str(s2.depots.iloc[1]["id"])
    fleet = {
        first: DepotFleet(units=[(4000, 2)], operating_s=3600.0),
        second: DepotFleet(units=[]),  # taken out of service
    }
    inst = _instance(s2, fleet)

    mine = [k for k, (d, _) in enumerate(inst.vehicles) if d == 0]
    assert [inst.vehicles[k][1] for k in mine] == [4000, 4000]
    assert all(inst.horizon_of(k) == 3600.0 for k in mine)
    assert not [1 for d, _ in inst.vehicles if d == 1], "an empty depot fields nothing"
    # every other depot keeps the default pair
    assert len(inst.vehicles) == 2 + 2 * (inst.n_depots - 2)


def test_solvers_respect_a_shorter_shift(s2):
    # One hour per crew everywhere: no route may outlast it.
    fleet = {
        str(row["id"]): DepotFleet(units=[(3000, 1), (5000, 1)], operating_s=3600.0)
        for _, row in s2.depots.iterrows()
    }
    inst = _instance(s2, fleet)
    sol = HybridACS(inst, ACSParams(iterations=6, n_ants=6, seed=1, time_limit_s=12)).solve()

    assert not [v for v in validate_hard_constraints(inst, sol.evaluation) if "HC7" in v]
    assert max(r.total_time for r in sol.evaluation.routes) <= 3600.0 + 1.0


def test_fleet_request_rejects_out_of_range_values():
    with pytest.raises(ValidationError):
        TankUnits(capacity_l=100, count=1)  # a tank that small is a typo
    with pytest.raises(ValidationError):
        TankUnits(capacity_l=3000, count=50)
    with pytest.raises(ValidationError):
        DepotFleetIn(depot_id="D1", operating_minutes=5)


def test_unknown_depot_in_fleet_is_422(client):
    r = client.post(
        "/api/optimize/acs?scenario=s2-jun",
        json={"fleet": [{"depot_id": "nope", "units": []}], "time_limit_s": 1},
    )
    assert r.status_code == 422


def test_empty_fleet_is_422(client, s2):
    fleet = [{"depot_id": str(i), "units": []} for i in s2.depots["id"]]
    r = client.post("/api/optimize/acs?scenario=s2-jun", json={"fleet": fleet, "time_limit_s": 1})
    assert r.status_code == 422
    assert "Armada kosong" in r.json()["detail"]


def test_fleet_defaults_endpoint(client):
    body = client.get("/api/optimize/fleet-defaults").json()
    assert body["capacities_l"] == [3000, 5000]
    assert body["operating_minutes"] == pytest.approx(281.0)


# --- severity weights -------------------------------------------------------


def test_default_severity_is_not_custom(s2):
    res = compute_severity_index(s2.floods, s2.faskes)
    assert res.custom is False


def test_custom_weights_replace_the_mix(s2):
    only_depth = compute_severity_index(s2.floods, s2.faskes, weights=[1, 0, 0])
    assert only_depth.custom is True
    assert only_depth.weights_combined.tolist() == [1.0, 0.0, 0.0]

    # With all weight on depth, severity is just the min-max scaled depth.
    depth = s2.floods["ketinggian_cm"].to_numpy(dtype=float)
    expected = (depth - depth.min()) / (depth.max() - depth.min())
    assert np.allclose(only_depth.si_values, expected, atol=1e-6)


def test_weights_are_normalised(s2):
    a = compute_severity_index(s2.floods, s2.faskes, weights=[2, 1, 1])
    b = compute_severity_index(s2.floods, s2.faskes, weights=[50, 25, 25])
    assert np.allclose(a.si_values, b.si_values)
    assert a.weights_combined.sum() == pytest.approx(1.0)


def test_priority_changes_who_ranks_first(s2):
    by_depth = compute_severity_index(s2.floods, s2.faskes, weights=[1, 0, 0]).si_values
    by_clinic = compute_severity_index(s2.floods, s2.faskes, weights=[0, 0, 1]).si_values
    assert int(np.argmax(by_depth)) != int(np.argmax(by_clinic))


@pytest.mark.parametrize("bad", [[1, 1], [1, 1, 1, 1], [-1, 1, 1], [0, 0, 0]])
def test_invalid_weights_are_rejected(bad):
    with pytest.raises(ValidationError):
        ACSRequest(severity_weights=bad)


def test_severity_preview_endpoint(client):
    default = client.post("/api/severity-index?scenario=s2-jun", json={"weights": None}).json()
    custom = client.post(
        "/api/severity-index?scenario=s2-jun", json={"weights": [1, 0, 0]}
    ).json()
    assert default["weights"]["mode"] == "default"
    assert custom["weights"]["mode"] == "custom"
    assert custom["weights"]["combined"] == [1.0, 0.0, 0.0]
    assert [p["si_value"] for p in custom["flood_points"]] != [
        p["si_value"] for p in default["flood_points"]
    ]
    assert client.post("/api/severity-index", json={"weights": [1, 2]}).status_code == 422


# --- flood intake validation --------------------------------------------------


def test_flood_input_bounds():
    ok = FloodPointCreate(lat=-7.25, lon=112.75, ketinggian_cm=40, volume_l=12000)
    assert ok.volume_l == 12000
    with pytest.raises(ValidationError):
        FloodPointCreate(lat=-7.25, lon=112.75, ketinggian_cm=-5)
    with pytest.raises(ValidationError):
        FloodPointCreate(lat=-7.25, lon=112.75, ketinggian_cm=900)
    with pytest.raises(ValidationError):
        FloodPointCreate(lat=-7.25, lon=112.75, volume_l=-1)
    with pytest.raises(ValidationError):
        FloodPointCreate(lat=-6.0, lon=112.75)  # outside Surabaya


def test_a_point_on_top_of_an_existing_one_is_a_duplicate(s2):
    row = s2.floods.iloc[0]
    with pytest.raises(HTTPException) as exc:
        _reject_duplicate(s2.floods, float(row["lat"]), float(row["lon"]))
    assert exc.value.status_code == 409

    # a few hundred metres away is a different puddle
    _reject_duplicate(s2.floods, float(row["lat"]) + 0.004, float(row["lon"]))
    assert DUPLICATE_RADIUS_M < 100
    _reject_duplicate(pd.DataFrame(columns=["id", "lat", "lon"]), -7.25, 112.75)
