"""Add fire posts that OpenStreetMap does not have to depo.csv and every study area.

The depots came from OSM (`amenity=fire_station`), which misses several of the
city's posts. This appends hand-listed ones to depo.csv and splices each into
every study area's distance/time matrices, so the existing legs stay as they
were and only the new rows and columns are asked of OSRM. Node order is
[depots, floods, outlets], so a new depot goes at the end of the depot block.

Input: a text file with one post per line,

    lat, lon, name, "address"

Posts without an OSM id get a made-up one from MANUAL_OSM_ID_START up (type
"manual"), so their ids (D_<osm_id>) are stable. Run, then stamp the dataset
dates after committing (scripts/stamp_dataset_dates.py):

    python scripts/add_depots.py path/to/posts.txt
"""

from __future__ import annotations

import csv
import io
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import SHARED_FILES, scenario_matrix_paths  # noqa: E402
from app.data import canvas, registry  # noqa: E402
from app.data.store import store  # noqa: E402
from app.preprocessing import enrich  # noqa: E402
from app.preprocessing import matrix as mx  # noqa: E402

# Made-up OSM ids for posts that are not on OSM; far above real way ids in use.
MANUAL_OSM_ID_START = 9_000_000_001


def read_posts(path: Path) -> list[dict[str, object]]:
    posts = []
    for row in csv.reader(io.StringIO(path.read_text(encoding="utf-8")), skipinitialspace=True):
        if not row or not "".join(row).strip():
            continue
        lat, lon, name, address = (c.strip() for c in row[:4])
        posts.append({"lat": float(lat), "lon": float(lon), "name": name, "address": address})
    return posts


def append_to_csv(posts: list[dict[str, object]]) -> list[dict[str, object]]:
    path = SHARED_FILES["depo"]
    raw = path.read_bytes()
    newline = "\r\n" if b"\r\n" in raw else "\n"
    text = raw.decode("utf-8")
    known = {(round(float(r["lat"]), 6), round(float(r["lon"]), 6)) for r in csv.DictReader(io.StringIO(text))}
    used = [int(r["osm_id"]) for r in csv.DictReader(io.StringIO(text))]
    next_id = max([MANUAL_OSM_ID_START - 1, *used]) + 1

    added = []
    for p in posts:
        if (round(p["lat"], 6), round(p["lon"], 6)) in known:
            print(f"skip (already there): {p['name']}")
            continue
        p = {**p, "osm_id": next_id, "id": f"D_{next_id}"}
        next_id += 1
        out = io.StringIO()
        csv.writer(out, lineterminator="").writerow(
            [p["osm_id"], "manual", p["lat"], p["lon"], p["name"], p["address"], p["id"]]
        )
        if not text.endswith(("\n", "\r\n")):
            text += newline
        text += out.getvalue() + newline
        added.append(p)
    path.write_bytes(text.encode("utf-8"))
    return added


def splice(sid: str, old_depots: int, added: list[dict[str, object]]) -> None:
    b = store.get(sid)  # still the old depot list: the store was loaded before the edit
    dist, tmat = b.distance_matrix, b.time_matrix
    if dist is None or tmat is None:
        print(f"{sid}: no matrices, skipped (it plans on Manhattan distances)")
        return
    lats = np.concatenate([b.depots["lat"], b.floods["lat"], b.ifs["lat"]]).astype(float)
    lons = np.concatenate([b.depots["lon"], b.floods["lon"], b.ifs["lon"]]).astype(float)
    for k, p in enumerate(added):
        pos = old_depots + k
        rd, cd, rt, ct = enrich.node_vectors(float(p["lat"]), float(p["lon"]), lats, lons)
        dist = mx.insert_node(dist, pos, rd, cd)
        tmat = mx.insert_node(tmat, pos, rt, ct)
        lats = np.insert(lats, pos, float(p["lat"]))
        lons = np.insert(lons, pos, float(p["lon"]))
    dpath, tpath = scenario_matrix_paths(sid)
    np.save(dpath, dist)
    np.save(tpath, tmat)
    print(f"{sid}: matrices now {dist.shape}")


def main() -> None:
    posts = read_posts(Path(sys.argv[1]))
    studies = [sid for sid in registry.scenario_ids() if not canvas.is_canvas(sid)]
    for sid in studies:
        store.get(sid)  # load with the old depots before depo.csv changes
    old_depots = len(store.get(studies[0]).depots)

    added = append_to_csv(posts)
    for p in added:
        print(f"added {p['id']}: {p['name']}")
    if added:
        for sid in studies:
            splice(sid, old_depots, added)

    # Check: every study area loads its matrices again (no Manhattan fallback).
    store.invalidate_shared()
    for sid in studies:
        b = store.get(sid)
        n = len(b.depots) + len(b.floods) + len(b.ifs)
        ok = b.distance_matrix is not None and b.distance_matrix.shape == (n, n)
        print(f"{sid}: {len(b.depots)} depots, matrix {'ok' if ok else 'MISMATCH'}")


if __name__ == "__main__":
    main()
