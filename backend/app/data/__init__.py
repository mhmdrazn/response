"""Module-level placeholders for static datasets.

Populated once by the FastAPI lifespan in ``app.main``. Import as
``import app.data as data`` and read ``data.flood_points`` etc.
"""

from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd

flood_points: Optional[pd.DataFrame] = None
depots: Optional[pd.DataFrame] = None
ifs: Optional[pd.DataFrame] = None
faskes: Optional[pd.DataFrame] = None
distance_matrix: Optional[np.ndarray] = None
time_matrix: Optional[np.ndarray] = None
