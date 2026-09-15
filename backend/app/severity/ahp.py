# AHP: priority vector and consistency ratio for SI computation

from __future__ import annotations

import numpy as np

# Saaty's Random Consistency Index for matrix sizes 1..10.
RANDOM_INDEX: dict[int, float] = {
    1: 0.0,
    2: 0.0,
    3: 0.58,
    4: 0.90,
    5: 1.12,
    6: 1.24,
    7: 1.32,
    8: 1.41,
    9: 1.45,
    10: 1.49,
}


def ahp_weights(pairwise: np.ndarray) -> np.ndarray:
    # Principal eigenvector method, normalized to sum to 1
    m = np.asarray(pairwise, dtype=float)
    if m.ndim != 2 or m.shape[0] != m.shape[1]:
        raise ValueError("pairwise must be a square matrix")
    eigvals, eigvecs = np.linalg.eig(m)
    idx = int(np.argmax(eigvals.real))
    vec = np.abs(eigvecs[:, idx].real)
    total = vec.sum()
    if total == 0:
        raise ValueError("degenerate pairwise matrix — zero eigenvector")
    return vec / total


def consistency_ratio(pairwise: np.ndarray) -> float:
    # CR <= 0.10 is conventionally acceptable
    m = np.asarray(pairwise, dtype=float)
    n = m.shape[0]
    if n < 3:
        return 0.0
    eigvals, _ = np.linalg.eig(m)
    lambda_max = eigvals.real.max()
    ci = (lambda_max - n) / (n - 1)
    ri = RANDOM_INDEX.get(n)
    if ri is None or ri == 0:
        return 0.0
    # CR is non-negative by definition; a near-consistent matrix can yield a
    # tiny negative CI from floating-point error in lambda_max. Clamp to 0 so
    # the UI never shows values like "-0.0000".
    return float(max(0.0, ci / ri))
