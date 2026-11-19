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
