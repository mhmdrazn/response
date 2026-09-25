import numpy as np

from app.severity.ahp import consistency_ratio
from app.severity.index import compute_severity_index


def test_cr_never_negative():
    # A perfectly consistent 3x3 matrix -> CR must be 0, never a tiny negative.
    m = np.array([[1, 2, 4], [0.5, 1, 2], [0.25, 0.5, 1]], dtype=float)
    assert consistency_ratio(m) >= 0.0


def test_si_values_finite_and_bounded(s2):
    res = compute_severity_index(s2.floods, s2.faskes)
    si = res.si_values
    assert len(si) == len(s2.floods)
    assert not np.isnan(si).any()
    assert (si >= 0).all() and (si <= 1).all()
    # weights are normalized
    assert abs(res.weights_combined.sum() - 1.0) < 1e-6
