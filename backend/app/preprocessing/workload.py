"""Turn a reported flood point into the pumping workload the fleet must move.

The damkar log records a coordinate and a depth, never an extent, so the
ponded water is treated as a box over the roadway:

    volume = road width x ponding length x depth to remove

Road width comes from the point's road_class. Ponding length is a parameter:
one report marks one local pond, and a flood spanning further is logged as
several points. Depth to remove is what sits above the level at which the road
is passable again — crews stop when the water is down, not when it is dry.

The haul count follows from the volume, which is the point of the model: how
many times a vehicle must come back is derived, not assumed.
"""

from __future__ import annotations

import numpy as np

# Carriageway width in metres per road_class ordinal (see config.HIGHWAY_ORDINAL:
# 5 trunk/primary, 4 secondary, 3 tertiary, 2 residential, 1 service).
ROAD_WIDTH_M = {1: 3.5, 2: 5.0, 3: 7.0, 4: 10.0, 5: 14.0}
DEFAULT_ROAD_WIDTH_M = 7.0

# Stretch of road one reported point stands for.
PONDING_LENGTH_M = 25.0

# Water may be left behind once the road is passable again.
SAFE_DEPTH_CM = 10.0

# A point already at or under the safe depth was still reported and attended,
# so it carries a token workload rather than none.
MIN_EFFECTIVE_DEPTH_CM = 5.0

DEFAULT_DEPTH_CM = 20.0


def effective_depth_cm(depth_cm: float | None) -> float:
    """Centimetres of water the fleet is expected to remove at one point."""
    d = DEFAULT_DEPTH_CM if depth_cm is None or not np.isfinite(depth_cm) else float(depth_cm)
    return max(d - SAFE_DEPTH_CM, MIN_EFFECTIVE_DEPTH_CM)


def road_width_m(road_class: float | None) -> float:
    if road_class is None or not np.isfinite(road_class):
        return DEFAULT_ROAD_WIDTH_M
    return ROAD_WIDTH_M.get(int(road_class), DEFAULT_ROAD_WIDTH_M)


def volume_liters(
    depth_cm: float | None,
    road_class: float | None,
    ponding_length_m: float = PONDING_LENGTH_M,
) -> float:
    """Litres to pump at one flood point. 1 m3 = 1000 L."""
    area = road_width_m(road_class) * ponding_length_m
    return area * (effective_depth_cm(depth_cm) / 100.0) * 1000.0


def hauls(volume_l: float, capacity_l: float) -> float:
    """How many tank loads that volume takes — the examiner's return count."""
    return volume_l / capacity_l if capacity_l > 0 else 0.0


def volumes_for_points(
    depths_cm: np.ndarray,
    road_classes: np.ndarray,
    ponding_length_m: float = PONDING_LENGTH_M,
) -> np.ndarray:
    depths = np.asarray(depths_cm, dtype=float)
    classes = np.asarray(road_classes, dtype=float)
    return np.array(
        [
            volume_liters(
                None if not np.isfinite(d) else float(d),
                None if not np.isfinite(c) else float(c),
                ponding_length_m,
            )
            for d, c in zip(depths, classes)
        ],
        dtype=float,
    )
