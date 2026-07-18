"""Data-prep (run once, not at runtime): produce the Surabaya kecamatan
boundary GeoJSON used by the choropleth layer.

The upstream source is admin level 4 (kelurahan/village) polygons; this script
dissolves them by `district` (kecamatan) into 31 clean administrative borders,
simplifies, and rounds coordinates to keep the payload small.

Source : JfrAziz/indonesia-district  (HDX-BPS-2020)
         id35_jawa_timur/id3578_kota_surabaya/id3578_kota_surabaya.geojson
Output : frontend/public/data/surabaya-kecamatan.geojson

Usage:
    pip install shapely
    python scripts/build-kecamatan-geojson.py <source.geojson> \
        public/data/surabaya-kecamatan.geojson
"""

import json
import sys

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

SRC = sys.argv[1]
OUT = sys.argv[2]

data = json.load(open(SRC, encoding="utf-8"))

# Group village features by kecamatan (district).
groups: dict[str, dict] = {}
for feat in data["features"]:
    props = feat["properties"]
    code = props["district_code"]
    g = groups.setdefault(code, {"name": props["district"], "code": code, "geoms": []})
    g["geoms"].append(shape(feat["geometry"]))

features = []
for code, g in sorted(groups.items(), key=lambda kv: kv[0]):
    # Dissolve: union all village polygons, buffer(0) to heal slivers.
    merged = unary_union(g["geoms"]).buffer(0)
    # ~30 m tolerance keeps borders crisp at city zoom while trimming payload.
    merged = merged.simplify(0.0003, preserve_topology=True)
    features.append(
        {
            "type": "Feature",
            "properties": {"kecamatan": g["name"], "code": code},
            "geometry": mapping(merged),
        }
    )

out = {"type": "FeatureCollection", "features": features}


def round_coords(obj):
    if isinstance(obj, list):
        return [round_coords(x) for x in obj]
    if isinstance(obj, float):
        return round(obj, 5)  # ~1.1 m precision
    return obj


for f in out["features"]:
    f["geometry"]["coordinates"] = round_coords(f["geometry"]["coordinates"])

json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"wrote {len(features)} kecamatan features -> {OUT}")
