"""Analytic Hierarchy Process — priority vector and consistency ratio.

Only the parts used by the SI computation are implemented; nothing fancy.
"""

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
    """Return the priority vector from an n×n pairwise-comparison matrix.

    Uses the principal eigenvector method. Result is normalized to sum to 1.
    """
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
    """Saaty's CR. Values <= 0.10 are conventionally acceptable."""
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
    return float(ci / ri)
