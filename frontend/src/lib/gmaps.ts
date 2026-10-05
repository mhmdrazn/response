import type { RouteOut } from "../types";

/** Google Maps accepts at most nine waypoints between origin and destination. */
const MAX_WAYPOINTS = 9;

export interface GoogleMapsLink {
  url: string;
  /** Distinct places in the link, ends included. */
  placesUsed: number;
  /** Distinct places the route passes, ends included. */
  placesTotal: number;
  /** Stops the route makes, repeats included. */
  visitsTotal: number;
  /** Most intermediate stops a link can carry. */
  waypointLimit: number;
}

interface Point {
  lat: number;
  lon: number;
}

const key = (p: Point) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;

/**
 * Directions link for one vehicle's route, in visiting order.
 *
 * A pumping route shuttles between the same flood point and outlet many times, so
 * it has dozens of stops but only a handful of places. Each place appears once, at
 * its first visit. If there are still more places than a link can carry, the middle
 * ones are thinned out evenly, keeping the departure and the final stop.
 */
export function buildGoogleMapsLink(route: RouteOut): GoogleMapsLink | null {
  if (route.visits.length < 2) return null;

  const origin: Point = route.visits[0];
  const destination: Point = route.visits[route.visits.length - 1];
  const ends = key(origin) === key(destination) ? 1 : 2;
  const seen = new Set([key(origin), key(destination)]);
  const middle: Point[] = [];
  for (const v of route.visits) {
    if (seen.has(key(v))) continue;
    seen.add(key(v));
    middle.push({ lat: v.lat, lon: v.lon });
  }

  let waypoints = middle;
  if (middle.length > MAX_WAYPOINTS) {
    waypoints = Array.from({ length: MAX_WAYPOINTS }, (_, i) => {
      const at = Math.round(((i + 0.5) * middle.length) / MAX_WAYPOINTS - 0.5);
      return middle[at];
    });
  }

  const coord = (p: Point) => `${p.lat},${p.lon}`;
  const params = new URLSearchParams({
    api: "1",
    origin: coord(origin),
    destination: coord(destination),
    travelmode: "driving",
  });
  if (waypoints.length > 0) params.set("waypoints", waypoints.map(coord).join("|"));

  return {
    url: `https://www.google.com/maps/dir/?${params.toString()}`,
    placesUsed: waypoints.length + ends,
    placesTotal: middle.length + ends,
    visitsTotal: route.visits.length,
    waypointLimit: MAX_WAYPOINTS,
  };
}
