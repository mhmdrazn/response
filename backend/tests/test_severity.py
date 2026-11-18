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


def test_ahp_matrix_is_the_geometric_mean_of_the_two_experts():
    import numpy as np

    from app.severity.index import EXPERT_MATRICES, PAIRWISE

    assert np.allclose(PAIRWISE, np.sqrt(EXPERT_MATRICES[0] * EXPERT_MATRICES[1]))
    # Still reciprocal: a_ji = 1 / a_ij.
    assert np.allclose(PAIRWISE * PAIRWISE.T, 1.0)


def test_ahp_weights_of_the_combined_matrix():
    import numpy as np

    from app.severity.ahp import ahp_weights
    from app.severity.index import PAIRWISE

    assert np.allclose(ahp_weights(PAIRWISE), [0.2873, 0.2230, 0.4897], atol=1e-3)


def test_combined_and_individual_matrices_are_consistent():
    from app.severity.ahp import consistency_ratio
    from app.severity.index import EXPERT_MATRICES, PAIRWISE

    cr = consistency_ratio(PAIRWISE)
    assert abs(cr - 0.056) < 1e-3 and cr < 0.10
    individual = [consistency_ratio(m) for m in EXPERT_MATRICES]
    assert abs(individual[0] - 0.046) < 1e-3 and abs(individual[1] - 0.066) < 1e-3
    assert all(c < 0.10 for c in individual)


def test_severity_endpoint_reports_the_expert_weights(client):
    body = client.get("/api/severity-index?scenario=s2-jun").json()
    w = body["weights"]
    assert [round(x, 3) for x in w["ahp"]] == [0.287, 0.223, 0.49]
    assert abs(w["consistency_ratio"] - 0.056) < 1e-3
