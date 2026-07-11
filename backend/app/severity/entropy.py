"""Entropy Weight — objective weights derived from a decision matrix."""

from __future__ import annotations

import numpy as np


def entropy_weights(data: np.ndarray) -> np.ndarray:
    """Return one weight per column, summing to 1.

    Input matrix rows = alternatives, columns = criteria. All values must
    already be positive (normalize into [0, 1] before calling if needed).
    """
    m = np.asarray(data, dtype=float)
    if m.ndim != 2:
        raise ValueError("data must be a 2-D matrix")
    n_rows, n_cols = m.shape
    if n_rows < 2:
        # Only one alternative → no entropy information; fall back to uniform.
        return np.full(n_cols, 1.0 / n_cols)

    # Normalize each column so its entries sum to 1.
    col_sums = m.sum(axis=0)
    col_sums = np.where(col_sums == 0, 1.0, col_sums)
    p = m / col_sums

    # Shannon entropy per criterion, normalized by ln(n).
    with np.errstate(divide="ignore", invalid="ignore"):
        log_p = np.where(p > 0, np.log(p), 0.0)
    k = 1.0 / np.log(n_rows)
    e = -k * (p * log_p).sum(axis=0)
    e = np.clip(e, 0.0, 1.0)

    # Degree of divergence; higher = more discriminating criterion.
    d = 1.0 - e
    total = d.sum()
    if total == 0:
        return np.full(n_cols, 1.0 / n_cols)
    return d / total
