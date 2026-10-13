"""Cut the Surabaya basemap out of a Protomaps planet build.

The map in the frontend draws vector tiles with MapLibre. Instead of a hosted
tile API, the app ships the few hundred tiles that cover Surabaya and its
surroundings as static files, like transit.oyenza.com does for Jakarta:

    frontend/public/tiles/surabaya/{z}/{x}/{y}.mvt   OSM data, Protomaps basemap schema
    frontend/public/tiles/fonts/{fontstack}/{range}.pbf   label glyphs

Tiles are read straight from the planet file with HTTP range requests, so
nothing big is downloaded. Needs `pip install pmtiles requests` (script only,
not an app dependency).

    python scripts/build_basemap_tiles.py [build-key]   e.g. 20261012.pmtiles
"""

from __future__ import annotations

import gzip
import math
import shutil
import sys
from pathlib import Path

import requests
from pmtiles.reader import Reader

BUILDS = "https://build-metadata.protomaps.dev/builds.json"
PLANET = "https://build.protomaps.com/{key}"
FONTS = "https://protomaps.github.io/basemaps-assets/fonts/{stack}/{range}.pbf"

# Surabaya (lon 112.59-112.85, lat -7.36 to -7.19) with about 9 km of buffer.
# Keep in sync with TILE_BOUNDS in frontend/src/lib/basemap-style.ts.
WEST, SOUTH, EAST, NORTH = 112.50, -7.45, 112.94, -7.10
MAX_ZOOM = 14  # the map overzooms past this; Protomaps keeps full detail at z14

FONT_STACKS = ["Noto Sans Regular", "Noto Sans Medium"]
# Latin, Latin-1, Latin Extended, punctuation: all Indonesian place names need.
FONT_RANGES = ["0-255", "256-511", "512-767", "768-1023", "7680-7935", "8192-8447", "8448-8703"]

ROOT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "tiles"


def tile_range(z: int) -> tuple[range, range]:
    n = 2**z

    def x_of(lon: float) -> int:
        return min(n - 1, int((lon + 180) / 360 * n))

    def y_of(lat: float) -> int:
        r = math.radians(lat)
        return min(n - 1, int((1 - math.asinh(math.tan(r)) / math.pi) / 2 * n))

    return range(x_of(WEST), x_of(EAST) + 1), range(y_of(NORTH), y_of(SOUTH) + 1)


def main() -> None:
    session = requests.Session()
    key = sys.argv[1] if len(sys.argv) > 1 else session.get(BUILDS, timeout=30).json()[-1]["key"]
    url = PLANET.format(key=key)

    def get_bytes(offset: int, length: int) -> bytes:
        r = session.get(url, headers={"Range": f"bytes={offset}-{offset + length - 1}"}, timeout=60)
        r.raise_for_status()
        return r.content

    reader = Reader(get_bytes)
    out = ROOT / "surabaya"
    if out.exists():
        shutil.rmtree(out)
    count = size = 0
    for z in range(MAX_ZOOM + 1):
        xs, ys = tile_range(z)
        for x in xs:
            for y in ys:
                data = reader.get(z, x, y)
                if not data:
                    continue
                if data[:2] == b"\x1f\x8b":  # planet tiles are gzipped; serve them plain
                    data = gzip.decompress(data)
                path = out / str(z) / str(x) / f"{y}.mvt"
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
                count += 1
                size += len(data)
        print(f"z{z}: {len(xs) * len(ys)} tiles", flush=True)
    print(f"{count} tiles, {size / 1e6:.1f} MB from {key}")

    for stack in FONT_STACKS:
        for rng in FONT_RANGES:
            r = session.get(FONTS.format(stack=stack.replace(" ", "%20"), range=rng), timeout=30)
            r.raise_for_status()
            path = ROOT / "fonts" / stack / f"{rng}.pbf"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(r.content)
    print(f"glyphs: {len(FONT_STACKS)} stacks x {len(FONT_RANGES)} ranges")


if __name__ == "__main__":
    main()
