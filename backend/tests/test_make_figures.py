import importlib.util
import sys
from pathlib import Path

import numpy as np

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "make_figures.py"
_spec = importlib.util.spec_from_file_location("make_figures", _SCRIPT)
assert _spec and _spec.loader
figures = importlib.util.module_from_spec(_spec)
sys.modules["make_figures"] = figures
_spec.loader.exec_module(figures)


def test_numbers_use_the_indonesian_format():
    assert figures.id_number(1526759.123, 2) == "1.526.759,12"
    assert figures.id_number(0.5, 1) == "0,5"
    assert figures.id_number(float("nan")) == ""


def test_traces_resample_as_a_step_function():
    trace = [
        {"t": 1.0, "best_score": 10.0},
        {"t": 2.2, "best_score": 7.0},
        {"t": 4.0, "best_score": 5.0},
    ]
    grid = np.arange(0.0, 5.0 + 1e-9, 0.5)
    got = figures.resample(trace, "best_score", grid)
    # Nothing before the first point, then the last value seen so far.
    assert np.isnan(got[0]) and np.isnan(got[1])
    assert list(got[2:]) == [10, 10, 10, 7, 7, 7, 5, 5, 5]


def test_route_ids_are_shortened_for_the_table():
    assert figures.short_id("if", "IF_012") == "IF12"
    assert figures.short_id("flood", "F_0028") == "F_0028"


def test_extra_results_are_split_per_scenario():
    rows = [
        {"experiment": "unserved_penalty", "scenario": "s1-jan"},
        {"experiment": "unserved_penalty", "scenario": "s2-jun"},
        {"experiment": "polish_slice", "scenario": "s2-jun"},
    ]
    got = [(e, s, len(g)) for e, s, g in figures._by_scenario(rows, ["polish_slice", "unserved_penalty"])]
    assert got == [("polish_slice", "s2-jun", 1), ("unserved_penalty", "s1-jan", 1), ("unserved_penalty", "s2-jun", 1)]
    assert figures._suffix("s2-jun") == "" and figures._suffix("s1-jan") == "_s1-jan"


def test_chi2_tail_matches_table_values():
    assert abs(figures.chi2_sf(9.4877, 4) - 0.05) < 1e-4
    assert abs(figures.chi2_sf(3.8415, 1) - 0.05) < 1e-4
    assert abs(figures.chi2_sf(13.2767, 4) - 0.01) < 1e-4


def test_friedman_statistic_by_hand():
    # Rank sums 6, 10, 14 over 5 blocks of 3: chi2 = 12/60 * 332 - 60 = 6.4.
    blocks = np.array([[1, 2, 3], [1, 2, 3], [1, 3, 2], [1, 2, 3], [2, 1, 3]], dtype=float)
    chi2, df, p = figures.friedman(blocks)
    assert abs(chi2 - 6.4) < 1e-9 and df == 2
    assert abs(p - np.exp(-3.2)) < 1e-9


def test_one_panel_only_when_every_run_is_fully_covered():
    full = [{"coverage_pct": "100", "score": "5", "objective_z": "5"}]
    short = full + [{"coverage_pct": "97", "score": "9", "objective_z": "5"}]
    assert figures.fully_covered(full)
    assert not figures.fully_covered(short)
    assert not figures.fully_covered([])


def test_depot_names_lose_the_common_prefix():
    assert figures.short_depot("Dinas Pemadam Kebakaran Pos Bulak", "D_1") == "Pos Bulak"
    assert figures.short_depot(None, "D_1") == "D_1"
