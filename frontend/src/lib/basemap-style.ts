import type {
  ExpressionSpecification,
  LayerSpecification,
  LngLatBoundsLike,
  StyleSpecification,
} from "maplibre-gl";

import type { BaseMapId } from "./map-constants";

// The basemap is OpenStreetMap data in the Protomaps schema, cut to Surabaya and
// shipped as static vector tiles (see backend/scripts/build_basemap_tiles.py).
// MapLibre draws it with the styles below, so every zoom level is sharp and the
// map can tilt into 3D. Cartographic colours live here, not in the design tokens:
// they paint the map itself, not the interface.

/** Area the tiles cover. Keep in sync with build_basemap_tiles.py. */
export const TILE_BOUNDS: [number, number, number, number] = [112.5, -7.45, 112.94, -7.1];

/** How far the camera may pan: Surabaya plus a buffer, a little inside the tiles. */
export const MAP_BOUNDS: LngLatBoundsLike = [
  [112.53, -7.43],
  [112.91, -7.12],
];

export const MIN_ZOOM = 10.5;
export const MAX_ZOOM = 19;
/** Zooming in past AUTO_3D_START tilts the map along with the zoom, reaching
 *  the full 3D tilt at AUTO_3D_FULL, before MAX_ZOOM. */
export const AUTO_3D_START = 15.8;
export const AUTO_3D_FULL = 17.2;
export const PITCH_3D = 60;

const TILE_MAX_ZOOM = 14;

export const BUILDINGS_LAYER_ID = "buildings-3d";

interface Palette {
  land: string;
  green: string;
  greenDeep: string;
  greenSoft: string;
  water: string;
  waterLine: string;
  hospital: string;
  school: string;
  commercial: string;
  industrial: string;
  pedestrian: string;
  building: string;
  tower: string;
  minor: string;
  minorCase: string;
  major: string;
  majorCase: string;
  primary: string;
  primaryCase: string;
  highway: string;
  highwayCase: string;
  tunnel: string;
  path: string;
  rail: string;
  label: string;
  labelStrong: string;
  area: string;
  waterLabel: string;
  halo: string;
}

/** Terang: soft grey land, white roads, pale blue water. */
const LIGHT: Palette = {
  land: "#F2F2F3",
  green: "#DCEBD6",
  greenDeep: "#D2E5CB",
  greenSoft: "#E6F0E2",
  water: "#C7DDED",
  waterLine: "#BAD3E6",
  hospital: "#EFEDED",
  school: "#EFEEEA",
  commercial: "#EFEEF0",
  industrial: "#ECECEE",
  pedestrian: "#F8F8F9",
  building: "#E9E9EC",
  tower: "#DCDCE1",
  minor: "#FFFFFF",
  minorCase: "#E3E3E6",
  major: "#FFFFFF",
  majorCase: "#D8D8DC",
  primary: "#FFFFFF",
  primaryCase: "#D2D2D7",
  highway: "#FFFFFF",
  highwayCase: "#C6C6CC",
  tunnel: "#EDEDEF",
  path: "#DADADE",
  rail: "#C6C6CC",
  label: "#8A8A90",
  labelStrong: "#55555B",
  area: "#9C9CA3",
  waterLabel: "#7B9CB9",
  halo: "#FFFFFF",
};

/** OpenStreetMap Carto's land colour, and buildings tinted to sit on it. */
const OSM_LAND = "#F2EFE9";
const OSM_BUILDINGS: Palette = { ...LIGHT, building: "#E3DCD3", tower: "#D6CEC4" };

/** Satelit keeps only the overlays drawn over the imagery. */
const SATELLITE_OVERLAY: Palette = {
  ...LIGHT,
  building: "#E9E9EC",
  tower: "#D6D6DB",
  label: "#F5F5F5",
  labelStrong: "#FFFFFF",
  area: "#E5E5E5",
  waterLabel: "#D7E7F5",
  halo: "#171717",
};

const FONT = ["Noto Sans Medium"];
const SOURCE = "basemap";

type Stops = (number | ExpressionSpecification)[];

const exp = (stops: Stops): ExpressionSpecification =>
  ["interpolate", ["exponential", 1.6], ["zoom"], ...stops] as ExpressionSpecification;
const lin = (stops: Stops): ExpressionSpecification =>
  ["interpolate", ["linear"], ["zoom"], ...stops] as ExpressionSpecification;
const detailIn = (...kinds: string[]): ExpressionSpecification => [
  "in",
  ["get", "kind_detail"],
  ["literal", kinds],
];
const name: ExpressionSpecification = ["coalesce", ["get", "name:id"], ["get", "name"]];

// Road widths per class, at zoom stops.
const W_MINOR = exp([13, 0.8, 14, 1.4, 16, 6, 18, 18, 19, 30]);
const W_MINOR_CASE = exp([13, 1.6, 14, 2.4, 16, 8, 18, 21, 19, 34]);
const W_MAJOR = exp([9, 0.6, 10, 0.8, 12, 1.6, 14, 4, 16, 10, 18, 26, 19, 40]);
const W_MAJOR_CASE = exp([9, 1.1, 10, 1.4, 12, 2.6, 14, 6, 16, 13, 18, 30, 19, 45]);
const W_HWY = exp([6, 0.6, 8, 1, 11, 2.2, 14, 6, 16, 12, 18, 30, 19, 45]);
const W_HWY_CASE = exp([6, 1, 8, 1.6, 11, 3.4, 14, 8.5, 16, 15, 18, 34, 19, 50]);

const isTunnel: ExpressionSpecification = ["has", "is_tunnel"];
const isBridge: ExpressionSpecification = ["has", "is_bridge"];
const surface = (f: ExpressionSpecification): ExpressionSpecification => [
  "all",
  ["!", isTunnel],
  ["!", isBridge],
  f,
];
const minorRoad: ExpressionSpecification = [
  "in",
  ["get", "kind"],
  ["literal", ["minor_road", "other"]],
];
const majorRoad: ExpressionSpecification = [
  "all",
  ["==", ["get", "kind"], "major_road"],
  ["!", detailIn("primary", "trunk", "primary_link", "trunk_link")],
];
const primaryRoad: ExpressionSpecification = [
  "all",
  ["==", ["get", "kind"], "major_road"],
  detailIn("primary", "trunk", "primary_link", "trunk_link"),
];
const highway: ExpressionSpecification = ["==", ["get", "kind"], "highway"];
const anyRoad: ExpressionSpecification = [
  "in",
  ["get", "kind"],
  ["literal", ["minor_road", "major_road", "highway", "other"]],
];

function road(
  id: string,
  filter: ExpressionSpecification,
  color: string | ExpressionSpecification,
  width: ExpressionSpecification,
  extra: { minzoom?: number; maxzoom?: number; paint?: Record<string, unknown> } = {},
): LayerSpecification {
  return {
    id,
    type: "line",
    source: SOURCE,
    "source-layer": "roads",
    filter,
    ...(extra.minzoom != null ? { minzoom: extra.minzoom } : {}),
    ...(extra.maxzoom != null ? { maxzoom: extra.maxzoom } : {}),
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": color, "line-width": width, ...(extra.paint ?? {}) },
  } as LayerSpecification;
}

function roadColor(p: Palette): ExpressionSpecification {
  return [
    "match",
    ["get", "kind"],
    "highway",
    p.highway,
    "major_road",
    ["case", detailIn("primary", "trunk", "primary_link", "trunk_link"), p.primary, p.major],
    p.minor,
  ];
}

function caseColor(p: Palette): ExpressionSpecification {
  return [
    "match",
    ["get", "kind"],
    "highway",
    p.highwayCase,
    "major_road",
    p.majorCase,
    p.minorCase,
  ];
}

function groundLayers(p: Palette): LayerSpecification[] {
  return [
    { id: "background", type: "background", paint: { "background-color": p.land } },
    {
      id: "landcover",
      type: "fill",
      source: SOURCE,
      "source-layer": "landcover",
      maxzoom: 12,
      paint: {
        "fill-color": [
          "match",
          ["get", "kind"],
          ["forest", "grassland", "scrub", "farmland"],
          p.greenSoft,
          p.land,
        ],
        "fill-opacity": lin([8, 0.8, 12, 0]),
      },
    },
    {
      id: "landuse-urban",
      type: "fill",
      source: SOURCE,
      "source-layer": "landuse",
      minzoom: 12,
      filter: [
        "in",
        ["get", "kind"],
        ["literal", ["commercial", "industrial", "railway", "military", "pedestrian", "platform"]],
      ],
      paint: {
        "fill-color": [
          "match",
          ["get", "kind"],
          "commercial",
          p.commercial,
          ["pedestrian", "platform"],
          p.pedestrian,
          p.industrial,
        ],
        "fill-opacity": lin([12, 0, 13, 1]),
      },
    },
    {
      id: "landuse-care",
      type: "fill",
      source: SOURCE,
      "source-layer": "landuse",
      minzoom: 12,
      filter: [
        "in",
        ["get", "kind"],
        ["literal", ["hospital", "school", "kindergarten", "college", "university"]],
      ],
      paint: {
        "fill-color": ["match", ["get", "kind"], "hospital", p.hospital, p.school],
        "fill-opacity": lin([12, 0, 13, 1]),
      },
    },
    {
      id: "landuse-green",
      type: "fill",
      source: SOURCE,
      "source-layer": "landuse",
      filter: [
        "in",
        ["get", "kind"],
        [
          "literal",
          [
            "park",
            "grass",
            "garden",
            "forest",
            "wood",
            "cemetery",
            "scrub",
            "recreation_ground",
            "meadow",
            "playground",
            "grassland",
            "golf_course",
            "farmland",
            "nature_reserve",
            "pitch",
            "wetland",
          ],
        ],
      ],
      paint: {
        "fill-color": [
          "match",
          ["get", "kind"],
          ["forest", "wood", "nature_reserve"],
          p.greenDeep,
          ["cemetery", "farmland", "meadow", "scrub"],
          p.greenSoft,
          p.green,
        ],
        "fill-opacity": lin([10, 0.6, 13, 1]),
      },
    },
  ];
}

function waterLayers(p: Palette): LayerSpecification[] {
  return [
    {
      id: "water",
      type: "fill",
      source: SOURCE,
      "source-layer": "water",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": p.water },
    },
    {
      id: "water-line",
      type: "line",
      source: SOURCE,
      "source-layer": "water",
      filter: ["==", ["geometry-type"], "LineString"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": p.waterLine,
        "line-width": lin([
          11,
          0.5,
          14,
          ["match", ["get", "kind"], ["river", "canal"], 3, 1.5],
          18,
          ["match", ["get", "kind"], ["river", "canal"], 14, 5],
        ]),
      },
    },
  ];
}

function roadLayers(p: Palette): LayerSpecification[] {
  const fill = roadColor(p);
  const casing = caseColor(p);
  const elevated: ExpressionSpecification = ["any", isTunnel, isBridge];
  return [
    road(
      "roads-low-case",
      ["all", ["in", ["get", "kind"], ["literal", ["major_road", "highway"]]], elevated],
      casing,
      W_MAJOR_CASE,
      { maxzoom: 13 },
    ),
    road(
      "roads-low",
      ["all", ["in", ["get", "kind"], ["literal", ["major_road", "highway"]]], elevated],
      fill,
      W_MAJOR,
      { maxzoom: 13 },
    ),
    road(
      "tunnels",
      [
        "all",
        isTunnel,
        ["in", ["get", "kind"], ["literal", ["minor_road", "major_road", "highway"]]],
      ],
      p.tunnel,
      W_MINOR,
      { minzoom: 13, paint: { "line-opacity": 0.9 } },
    ),
    road("minor-case", surface(minorRoad), p.minorCase, W_MINOR_CASE, { minzoom: 13 }),
    road("major-case", surface(majorRoad), p.majorCase, W_MAJOR_CASE, { minzoom: 9 }),
    road("primary-case", surface(primaryRoad), p.primaryCase, W_MAJOR_CASE, { minzoom: 9 }),
    road("highway-case", surface(highway), p.highwayCase, W_HWY_CASE, { minzoom: 6 }),
    road("paths", surface(["==", ["get", "kind"], "path"]), p.path, lin([16, 0.8, 18, 2]), {
      minzoom: 16,
      paint: { "line-dasharray": [1.5, 1.5] },
    }),
    road("minor", surface(minorRoad), p.minor, W_MINOR, { minzoom: 13 }),
    road("major", surface(majorRoad), p.major, W_MAJOR, { minzoom: 9 }),
    road("primary", surface(primaryRoad), p.primary, W_MAJOR, { minzoom: 9 }),
    road("highway", surface(highway), p.highway, W_HWY, { minzoom: 6 }),
    road("bridges-case", ["all", isBridge, anyRoad], casing, W_MAJOR_CASE, { minzoom: 13 }),
    road("bridges", ["all", isBridge, anyRoad], fill, W_MAJOR, { minzoom: 13 }),
    road(
      "rail",
      ["all", ["==", ["get", "kind"], "rail"], ["==", ["get", "kind_detail"], "rail"]],
      p.rail,
      lin([11, 0.8, 16, 2.4]),
      { minzoom: 11, paint: { "line-dasharray": [3, 2] } },
    ),
  ];
}

function buildingLayer(p: Palette, visible: boolean, opacity = 0.92): LayerSpecification {
  return {
    id: BUILDINGS_LAYER_ID,
    type: "fill-extrusion",
    source: SOURCE,
    "source-layer": "buildings",
    minzoom: 14.5,
    layout: { visibility: visible ? "visible" : "none" },
    paint: {
      "fill-extrusion-color": [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "height"], 6],
        0,
        p.building,
        60,
        p.tower,
      ],
      // Buildings rise out of the ground as the map zooms in, instead of popping up.
      "fill-extrusion-height": [
        "interpolate",
        ["linear"],
        ["zoom"],
        14.5,
        0,
        15.5,
        ["coalesce", ["get", "height"], 6],
      ],
      "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
      "fill-extrusion-opacity": opacity,
      "fill-extrusion-vertical-gradient": true,
    },
  };
}

function labelLayers(p: Palette): LayerSpecification[] {
  const halo = { "text-halo-color": p.halo, "text-halo-width": 1.4 };
  return [
    {
      id: "water-label",
      type: "symbol",
      source: SOURCE,
      "source-layer": "water",
      minzoom: 14,
      filter: [
        "all",
        ["has", "name"],
        ["==", ["geometry-type"], "Polygon"],
        ["in", ["get", "kind"], ["literal", ["lake", "water"]]],
      ],
      layout: { "text-field": name, "text-font": FONT, "text-size": 11, "text-max-width": 8 },
      paint: { "text-color": p.waterLabel, ...halo },
    },
    {
      id: "river-label",
      type: "symbol",
      source: SOURCE,
      "source-layer": "water",
      minzoom: 14,
      filter: [
        "all",
        ["has", "name"],
        ["==", ["geometry-type"], "LineString"],
        ["in", ["get", "kind"], ["literal", ["river", "canal"]]],
      ],
      layout: {
        "text-field": name,
        "text-font": FONT,
        "text-size": 11,
        "symbol-placement": "line",
        "symbol-spacing": 400,
      },
      paint: { "text-color": p.waterLabel, ...halo },
    },
    {
      id: "road-label-minor",
      type: "symbol",
      source: SOURCE,
      "source-layer": "roads",
      minzoom: 15.5,
      filter: ["all", ["has", "name"], minorRoad],
      layout: {
        "symbol-placement": "line",
        "text-field": name,
        "text-font": FONT,
        "text-size": lin([15.5, 10, 18, 12]),
        "symbol-spacing": 320,
        "text-max-angle": 30,
      },
      paint: { "text-color": p.label, ...halo },
    },
    {
      id: "road-label-major",
      type: "symbol",
      source: SOURCE,
      "source-layer": "roads",
      minzoom: 12.5,
      filter: [
        "all",
        ["has", "name"],
        ["in", ["get", "kind"], ["literal", ["major_road", "highway"]]],
      ],
      layout: {
        "symbol-placement": "line",
        "text-field": name,
        "text-font": FONT,
        "text-size": lin([12.5, 10, 16, 12.5, 18, 14]),
        "symbol-spacing": 360,
        "text-max-angle": 30,
      },
      paint: { "text-color": p.label, ...halo },
    },
    {
      id: "area-label",
      type: "symbol",
      source: SOURCE,
      "source-layer": "places",
      minzoom: 12.2,
      maxzoom: 17,
      filter: [
        "all",
        ["==", ["get", "kind"], "locality"],
        [
          "in",
          ["get", "kind_detail"],
          ["literal", ["village", "neighbourhood", "hamlet", "locality", "suburb", "quarter"]],
        ],
      ],
      layout: {
        "text-field": name,
        "text-font": FONT,
        "text-size": lin([12, 9.5, 15, 11.5]),
        "text-transform": "uppercase",
        "text-letter-spacing": 0.12,
        "text-max-width": 7,
        "text-padding": 6,
        "symbol-sort-key": ["-", 0, ["coalesce", ["get", "population"], 0]],
      },
      paint: {
        "text-color": p.area,
        ...halo,
        "text-opacity": lin([12.2, 0, 12.8, 1, 16.4, 1, 17, 0]),
      },
    },
    {
      id: "city-label",
      type: "symbol",
      source: SOURCE,
      "source-layer": "places",
      maxzoom: 12.5,
      filter: [
        "all",
        ["==", ["get", "kind"], "locality"],
        ["in", ["get", "kind_detail"], ["literal", ["city", "town"]]],
      ],
      layout: {
        "text-field": name,
        "text-font": FONT,
        "text-size": lin([5, 11, 8, 12, 12, 16]),
        "symbol-sort-key": ["-", 0, ["coalesce", ["get", "population"], 0]],
      },
      paint: { "text-color": p.labelStrong, ...halo, "text-halo-width": 1.6 },
    },
  ];
}

/** Colours for the basemap picker's preview; only Terang is drawn from a palette. */
export function basemapSwatch(id: BaseMapId): BasemapSwatch | null {
  if (id !== "positron") return null;
  const p = LIGHT;
  return { land: p.land, water: p.water, green: p.green, road: p.major, roadCase: p.majorCase };
}

export interface BasemapSwatch {
  land: string;
  water: string;
  green: string;
  road: string;
  roadCase: string;
}

/** Background colour per basemap, for the container behind the canvas. */
export function basemapBackground(id: BaseMapId): string {
  if (id === "satellite") return "#171717";
  return id === "standard" ? OSM_LAND : LIGHT.land;
}

/** Credit line for the basemap in use, shown under the basemap picker. */
export function basemapCredit(id: BaseMapId): string {
  if (id === "standard") return "Peta © kontributor OpenStreetMap";
  if (id === "satellite") return "Citra © Esri · Gedung © kontributor OpenStreetMap";
  return "Data peta © kontributor OpenStreetMap, diolah dengan Protomaps dan MapLibre";
}

/** Full MapLibre style for a basemap. Absolute URLs, so call it in the browser. */
export function basemapStyle(id: BaseMapId, buildings3d: boolean): StyleSpecification {
  const origin = window.location.origin;
  const sources: StyleSpecification["sources"] = {
    [SOURCE]: {
      type: "vector",
      tiles: [`${origin}/tiles/surabaya/{z}/{x}/{y}.mvt`],
      minzoom: 0,
      maxzoom: TILE_MAX_ZOOM,
      bounds: TILE_BOUNDS,
    },
  };

  let layers: LayerSpecification[];
  if (id === "satellite") {
    sources.imagery = rasterSource(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      // Imagery stops at z18 in places; past it MapLibre enlarges z18 instead of
      // showing Esri's "Map data not yet available" tiles.
      18,
    );
    const p = SATELLITE_OVERLAY;
    layers = [
      { id: "background", type: "background", paint: { "background-color": "#171717" } },
      { id: "imagery", type: "raster", source: "imagery" },
      // See-through, so the imagery still shows under the blocks.
      buildingLayer(p, buildings3d, 0.45),
      ...labelLayers(p).filter((l) => l.id !== "water-label"),
    ];
  } else if (id === "standard") {
    // OpenStreetMap's own rendering, as raster tiles; buildings still rise from the vector tiles.
    sources.osm = rasterSource("https://tile.openstreetmap.org/{z}/{x}/{y}.png", 19);
    layers = [
      { id: "background", type: "background", paint: { "background-color": OSM_LAND } },
      { id: "osm", type: "raster", source: "osm" },
      buildingLayer(OSM_BUILDINGS, buildings3d),
    ];
  } else {
    const p = LIGHT;
    layers = [
      ...groundLayers(p),
      ...waterLayers(p),
      ...roadLayers(p),
      buildingLayer(p, buildings3d),
      ...labelLayers(p),
    ];
  }

  return {
    version: 8,
    name: `Response ${id}`,
    glyphs: `${origin}/tiles/fonts/{fontstack}/{range}.pbf`,
    // Soft light keeps building walls pale, close to the flat map's own greys.
    light: { anchor: "viewport", color: "#ffffff", intensity: 0.2, position: [1.2, 200, 40] },
    // A tilted camera sees a sky above the horizon, and the far ground fades into
    // haze, so the view never ends at the edge of the Surabaya tiles.
    sky: skyFor(id),
    sources,
    layers,
  };
}

function skyFor(id: BaseMapId): StyleSpecification["sky"] {
  const ground = basemapBackground(id);
  const satellite = id === "satellite";
  return {
    "sky-color": satellite ? "#9FB8CC" : "#DCE7EF",
    "horizon-color": satellite ? "#C9D3DB" : "#EEF2F5",
    "fog-color": satellite ? "#AEB9C2" : ground,
    "sky-horizon-blend": 0.6,
    "horizon-fog-blend": 0.75,
    "fog-ground-blend": 0.35,
    "atmosphere-blend": 0,
  };
}

// Raster tiles are worldwide, so a tilted camera sees past the city to the horizon;
// panning is still held to MAP_BOUNDS.
function rasterSource(url: string, maxzoom: number): StyleSpecification["sources"][string] {
  return { type: "raster", tiles: [url], tileSize: 256, maxzoom };
}
