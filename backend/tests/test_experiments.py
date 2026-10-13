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
