import importlib.util
import math
import sys
from pathlib import Path

import numpy as np
import pytest

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "run_experiments.py"
_spec = importlib.util.spec_from_file_location("run_experiments", _SCRIPT)
assert _spec and _spec.loader
experiments = importlib.util.module_from_spec(_spec)
# dataclasses resolve the module through sys.modules while the class is built.
sys.modules["run_experiments"] = experiments
_spec.loader.exec_module(experiments)


def test_identical_samples_have_no_evidence_of_a_difference():
    x = np.arange(10.0)
    res = experiments.wilcoxon_signed_rank(x, x)
    assert res["n"] == 0
    assert res["p_value"] == 1.0


def test_exact_p_when_every_pair_favours_one_side():
    # All ten differences positive and distinct: W- = 0, and the only sign
    # pattern as extreme on each side gives p = 2 / 2**10.
    x = np.arange(1.0, 11.0) + 100.0
    y = np.zeros(10)
    res = experiments.wilcoxon_signed_rank(x, y)
    assert res["method"] == "exact"
    assert res["statistic"] == 0.0
    assert res["p_value"] == pytest.approx(2 / 2**10)


def test_exact_p_matches_enumerating_every_sign_pattern():
    # Differences 1..8 with signs + + - + + + - +: W- = 3 + 7 = 10. Under the
    # null every one of the 2**8 sign patterns is equally likely.
    from itertools import product

    d = np.array([1, 2, -3, 4, 5, 6, -7, 8], dtype=float)
    res = experiments.wilcoxon_signed_rank(d, np.zeros_like(d))
    assert res["w_minus"] == 10.0

    ranks = np.arange(1, 9)
    as_extreme = sum(
        1 for signs in product((0, 1), repeat=8) if ranks[np.array(signs) == 1].sum() <= 10
    )
    assert res["p_value"] == pytest.approx(min(1.0, 2 * as_extreme / 2**8))


def test_ties_use_the_normal_approximation_with_average_ranks():
    d = np.array([2, 2, 2, -1, 3, 3, 4, 5, 6, 7, 8, 9], dtype=float)
    res = experiments.wilcoxon_signed_rank(d, np.zeros_like(d))
    assert res["method"] == "normal"
    assert res["w_plus"] + res["w_minus"] == pytest.approx(12 * 13 / 2)
    assert 0.0 < res["p_value"] < 0.05
    assert res["effect_r"] == pytest.approx(abs(res["z"]) / math.sqrt(12), abs=1e-4)


def test_average_ranks_share_tied_positions():
    ranks = experiments._average_ranks(np.array([3.0, 1.0, 3.0, 2.0]))
    assert list(ranks) == [3.5, 1.0, 3.5, 2.0]


def test_plan_covers_the_requested_settings():
    from argparse import Namespace

    args = Namespace(
        seeds=30, sensitivity_seeds=30, time_limit=45.0,
        scenarios=["s1-jan", "s2-jun", "s3-nov"], only=["main", "horizon", "dispatch"],
    )
    jobs = experiments.plan(args)
    main = [j for j in jobs if j.experiment == "main"]
    assert len(main) == 3 * 2 * 30
    assert {j.horizon_min for j in jobs if j.experiment == "horizon"} == {240, 281, 360, 517}
    assert {j.dispatch_min for j in jobs if j.experiment == "dispatch"} == {5, 7, 10, 15}
    assert {j.scenario for j in jobs if j.experiment != "main"} == {"s2-jun"}


def test_acs_params_runs_each_distinct_setting_once():
    from argparse import Namespace

    args = Namespace(
        seeds=30, sensitivity_seeds=30, time_limit=45.0,
        scenarios=["s2-jun"], only=["acs_params"],
    )
    jobs = experiments.plan(args)
    settings = {(j.param, j.param_value) for j in jobs}
    # All-default once, plus the two off-default values of each parameter.
    assert settings == {
        ("default", 0.0),
        ("n_ants", 10.0), ("n_ants", 30.0),
        ("q0", 0.5), ("q0", 0.7),
        ("rho", 0.10), ("rho", 0.30),
    }
    assert len(jobs) == 7 * 30
    assert {j.algorithm for j in jobs} == {"acs"}
    assert {j.scenario for j in jobs} == {"s2-jun"}
    assert {j.time_limit_s for j in jobs} == {45.0}


def test_acs_summary_counts_the_default_runs_in_every_group():
    def row(param, value, seed, z):
        return {
            "experiment": "acs_params", "param": param, "param_value": str(value),
            "seed": str(seed), "objective_z": str(z), "score": str(z + 10),
            "coverage_pct": "90", "vehicles_used": "12", "iterations": "40",
        }

    runs = [row("default", 0, s, 100 + s) for s in (1, 2)]
    runs += [row("n_ants", 10, s, 200 + s) for s in (1, 2)]
    summary = experiments.summarise_acs(runs)
    by = {(r["param"], r["value"]): r for r in summary}

    for param, default in (("n_ants", "20"), ("q0", "0.9"), ("rho", "0.15")):
        assert by[(param, default)]["is_default"] is True
        assert by[(param, default)]["n_runs"] == 2
        assert by[(param, default)]["z_median"] == 101.5
    assert by[("n_ants", "10")]["z_mean"] == 201.5
    assert by[("n_ants", "10")]["is_default"] is False
    # Settings with no runs yet are left out rather than reported empty.
    assert ("q0", "0.7") not in by


# --- Bab 6 additions: extra experiments, traces, best solutions, reports ---------


def _ns(**kw):
    from argparse import Namespace

    base = dict(
        seeds=30, sensitivity_seeds=30, extra_seeds=15, time_limit=45.0,
        scenarios=["s1-jan", "s2-jun", "s3-nov"], only=experiments.EXPERIMENTS,
    )
    return Namespace(**{**base, **kw})


def test_plan_has_the_polish_slice_and_unserved_penalty_experiments():
    jobs = experiments.plan(_ns(only=["polish_slice", "unserved_penalty"]))
    polish = [j for j in jobs if j.experiment == "polish_slice"]
    penalty = [j for j in jobs if j.experiment == "unserved_penalty"]
    assert len(polish) == 5 * 2 * 15 and len(penalty) == 4 * 2 * 15
    assert {j.param_value for j in polish} == {0.1, 0.3, 0.5, 1.0, 2.0}
    assert {j.param_value for j in penalty} == {100.0, 250.0, 500.0, 1000.0}
    assert {j.scenario for j in jobs} == {"s2-jun"}
    assert {j.algorithm for j in jobs} == {"acs", "vns"}


def test_trace_file_names_name_the_setting():
    J = experiments.Job
    assert J("main", "s2-jun", "acs", 3, 281, 7, 45).trace_name() == "main_s2-jun_acs_default_0_s3.json"
    assert J("horizon", "s2-jun", "vns", 1, 240, 7, 45).trace_name() == "horizon_s2-jun_vns_horizon_min_240_s1.json"
    assert (
        J("polish_slice", "s2-jun", "acs", 2, 281, 7, 45, "polish_slice_s", 0.5).trace_name()
        == "polish_slice_s2-jun_acs_polish_slice_s_0.5_s2.json"
    )


def _run(algo, seed, z, cov=100.0, exp="main"):
    return {
        "experiment": exp, "scenario": "s2-jun", "algorithm": algo, "seed": str(seed),
        "horizon_min": "281", "dispatch_min": "7", "param": "", "param_value": "0",
        "objective_z": str(z), "score": str(z), "coverage_pct": str(cov),
        "total_distance_m": "1000", "vehicles_used": "10", "if_visits": "20",
        "excess_visits": "0", "runtime_s": "45", "iterations": "30",
        "unserved_l": "0", "makespan_s": "600", "violations": "0", "best_found_s": "12",
    }


def test_summary_reports_best_and_worst_of_every_metric():
    runs = [_run("acs", s, 100 + s) for s in (1, 2, 3)]
    (row,) = experiments.summarise(runs)
    assert row["objective_z_min"] == 101 and row["objective_z_max"] == 103
    assert row["objective_z_median"] == 102
    for m in experiments.SUMMARY_METRICS:
        assert {f"{m}_{k}" for k in ("mean", "std", "median", "min", "max")} <= set(row)


def test_summary_reads_runs_written_before_the_new_columns():
    old = _run("acs", 1, 100)
    del old["if_visits"], old["best_found_s"]
    (row,) = experiments.summarise([old])
    assert row["if_visits_mean"] == "" and row["objective_z_mean"] == 100


def test_wilcoxon_tests_every_metric_and_names_the_better_solver():
    runs = [_run("acs", s, 100 + s, cov=99.0) for s in range(1, 13)]
    runs += [_run("vns", s, 200 + s, cov=98.0) for s in range(1, 13)]
    rows = {r["metric"]: r for r in experiments.compare(runs)}
    assert set(rows) == set(experiments.TEST_METRICS)
    assert rows["objective_z"]["better"] == "acs"          # lower Z wins
    assert rows["coverage_pct"]["better"] == "acs"         # higher coverage wins
    assert rows["total_distance_m"]["better"] == "tie"     # no difference at all
    assert rows["objective_z"]["n"] == 12 and rows["objective_z"]["p_value"] < 0.05
    expected = ["experiment", "scenario", "setting", "metric", "n", "mean_acs", "mean_vns",
                "median_diff", "W", "p_value", "effect_size_r", "better"]
    assert list(rows["objective_z"]) == expected


def test_old_runs_csv_is_migrated_to_the_new_columns(tmp_path):
    import csv

    path = tmp_path / "runs.csv"
    old_fields = [f for f in experiments.RUN_FIELDS if f not in ("if_visits", "best_found_s")]
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=old_fields)
        w.writeheader()
        w.writerow({f: "1" for f in old_fields})
    experiments._migrate_runs(path)
    rows = experiments._read_runs(path)
    assert list(rows[0]) == experiments.RUN_FIELDS and rows[0]["if_visits"] == ""


def test_best_solution_is_only_replaced_by_a_better_run(tmp_path):
    def row(score, seed):
        r = {k: 0 for k in experiments.BEST_METRICS}
        return {**r, "scenario": "s2-jun", "algorithm": "acs", "seed": seed,
                "time_limit_s": 45, "score": score}

    import json

    assert experiments.keep_if_best(tmp_path, row(500.0, 1), [])
    assert not experiments.keep_if_best(tmp_path, row(600.0, 2), [])
    assert experiments.keep_if_best(tmp_path, row(400.0, 3), [])
    held = json.loads((tmp_path / "best" / "s2-jun_acs.json").read_text(encoding="utf-8"))
    assert held["seed"] == 3


def test_default_workers_stay_at_or_below_six():
    assert 1 <= experiments.default_workers() <= 6


@pytest.mark.parametrize("algo", ["acs", "vns"])
def test_a_run_returns_its_trace_and_routes(algo):
    job = experiments.Job("main", "s2-jun", algo, 1, 281, 7, 6.0)
    row = experiments.run_job(job)
    trace, routes = row["_trace"], row["_routes"]
    assert trace and set(trace[0]) == {"iter", "t", "best_score", "best_z", "iter_best_score"}
    assert trace[-1]["best_score"] == pytest.approx(row["score"], rel=1e-6)
    assert trace[-1]["best_z"] == pytest.approx(row["objective_z"], rel=1e-6)
    assert all(a["t"] <= b["t"] for a, b in zip(trace, trace[1:]))
    assert 0 <= row["best_found_s"] <= trace[-1]["t"] + 1e-6
    assert row["if_visits"] == sum(r["if_visits"] for r in routes)
    assert len(routes) == row["vehicles_used"]
    first = routes[0]
    assert {"vehicle", "depot_id", "capacity_l", "distance_m", "time_s", "if_visits", "visits"} <= set(first)
    assert {v["type"] for v in first["visits"]} <= {"flood", "if"}


def test_unserved_penalty_and_polish_slice_reach_the_solver(monkeypatch):
    from app.algorithms import instance as inst_mod

    seen = {}
    real = inst_mod.build_instance

    def spy(**kw):
        seen["penalty"] = kw.get("unserved_penalty")
        return real(**kw)

    monkeypatch.setattr(inst_mod, "build_instance", spy)
    job = experiments.Job("unserved_penalty", "s2-jun", "vns", 1, 281, 7, 4.0, "unserved_penalty", 250.0)
    experiments.run_job(job)
    assert seen["penalty"] == 250.0


def test_unserved_penalty_can_run_on_other_scenarios():
    jobs = experiments.plan(_ns(only=["unserved_penalty"], penalty_scenarios=["s1-jan", "s2-jun"]))
    assert {j.scenario for j in jobs} == {"s1-jan", "s2-jun"}
    assert len(jobs) == 2 * 4 * 2 * 15
