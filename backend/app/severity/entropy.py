# Entropy Weight: objective weights from a decision matrix

from __future__ import annotations

import numpy as np


def entropy_weights(data: np.ndarray) -> np.ndarray:
    # Rows = alternatives, columns = criteria; values must be positive
    m = np.asarray(data, dtype=float)
    if m.ndim != 2:
        raise ValueError("data must be a 2-D matrix")
    n_rows, n_cols = m.shape
    if n_rows < 2:
        return np.full(n_cols, 1.0 / n_cols)

    col_sums = m.sum(axis=0)
    col_sums = np.where(col_sums == 0, 1.0, col_sums)
    p = m / col_sums

    with np.errstate(divide="ignore", invalid="ignore"):
        log_p = np.where(p > 0, np.log(p), 0.0)
    k = 1.0 / np.log(n_rows)
    e = -k * (p * log_p).sum(axis=0)
    e = np.clip(e, 0.0, 1.0)

    d = 1.0 - e
    total = d.sum()
    if total == 0:
        return np.full(n_cols, 1.0 / n_cols)
    return d / total
