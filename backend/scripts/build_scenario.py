#!/usr/bin/env python
"""Build a scenario data bundle (floods.csv + OSRM matrices) offline.

Run from the backend/ directory (with its virtualenv):

    python scripts/build_scenario.py --warm-cache
    python scripts/build_scenario.py --id s1-jan --from 2025-01-11 --to 2025-01-12 \
        --name "11-12 Januari 2025"
    python scripts/build_scenario.py --id s3 --csv data/points.csv --name "Skenario bebas"

Requires internet (Overpass for the road network on first run, OSRM for faskes
distance + node matrices). The road network is cached after the first fetch.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/ on path

from app.preprocessing import build, roads, scenario  # noqa: E402


def main() -> None:
    p = argparse.ArgumentParser(description="Build a scenario data bundle.")
    p.add_argument("--warm-cache", action="store_true", help="Fetch + cache the road network, then exit.")
    p.add_argument("--id", help="Scenario id (folder name), e.g. s1-jan")
    p.add_argument("--from", dest="date_from", help="Start date YYYY-MM-DD")
    p.add_argument("--to", dest="date_to", help="End date YYYY-MM-DD")
    p.add_argument("--csv", help="Free scenario: CSV with lat,lon,depth_cm[,tanggal,terima_berita,detail]")
    p.add_argument("--name", help="Human-readable scenario name")
    p.add_argument("--desc", help="Scenario description")
    p.add_argument("--no-dedup", action="store_true", help="Skip coincident-point dedup")
    p.add_argument("--radius", type=float, default=200.0, help="Dedup radius (m), default 200")
    args = p.parse_args()

    if args.warm_cache:
        gdf = roads.load_road_network(refresh=True)
        print(f"Road network cached: {len(gdf)} ways.")
        return

    if not args.id:
        p.error("--id is required (unless --warm-cache)")

    dedup = not args.no_dedup
    if args.csv:
        points = scenario.from_csv(Path(args.csv), dedup=dedup, radius_m=args.radius)
    elif args.date_from and args.date_to:
        points = scenario.from_date_range(args.date_from, args.date_to, dedup=dedup, radius_m=args.radius)
    else:
        p.error("provide either --csv, or both --from and --to")

    roads_utm = roads.load_road_network()  # cached; fetches once if missing
    build.build_scenario(
        args.id, points,
        name=args.name, date_from=args.date_from, date_to=args.date_to, description=args.desc,
        roads_utm=roads_utm,
    )


if __name__ == "__main__":
    main()
