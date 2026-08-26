/**
 * Search-a-destination and bike-route fetching.
 *
 * Deliberately NOT client-side autocomplete: OSMF's Nominatim policy forbids
 * implementing type-ahead against its API, and the ORS geocoder this app
 * defaults to is the same OSM-derived data under the same norm. The search
 * bar debounces and only queries on a deliberate pause in typing (see
 * SEARCH_DEBOUNCE_MS), not on every keystroke.
 */
import { CONFIG } from './config';

export const SEARCH_DEBOUNCE_MS = 400;

export interface SearchResult {
  label: string;
  latitude: number;
  longitude: number;
}

export interface RoutePoint {
  latitude: number;
  longitude: number;
}

export interface RouteManeuver {
  instruction: string;
  distanceMeters: number;
}

export interface Route {
  points: RoutePoint[];
  distanceMeters: number;
  durationSeconds: number;
  maneuvers: RouteManeuver[];
}

export async function searchDestination(
  query: string,
  near: RoutePoint
): Promise<SearchResult[]> {
  if (query.trim().length === 0) return [];
  const url = new URL(CONFIG.geocodeUrl);
  url.searchParams.set('text', query);
  url.searchParams.set('focus.point.lat', String(near.latitude));
  url.searchParams.set('focus.point.lon', String(near.longitude));
  url.searchParams.set('size', '5');
  if (CONFIG.geocodeApiKey) url.searchParams.set('api_key', CONFIG.geocodeApiKey);

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Search failed: ${response.status}`);
  const body = await response.json();

  return (body.features ?? []).map((f: GeoJsonFeature) => ({
    label: f.properties?.label ?? 'Unknown place',
    longitude: f.geometry.coordinates[0],
    latitude: f.geometry.coordinates[1],
  }));
}

interface GeoJsonFeature {
  properties?: { label?: string };
  geometry: { coordinates: [number, number] };
}

/**
 * A per-edge routing cost multiplier: <1 makes an OSM edge cheaper (safer,
 * so prefer it), >1 makes it more expensive (avoid it). Produced by the
 * Segment Score milestone; nothing generates these yet.
 */
export interface EdgeCostFactor {
  edge_id: number;
  cost_factor: number;
}

export interface RouteRequestOptions {
  costFactors?: EdgeCostFactor[];
}

export interface ValhallaRouteRequest {
  locations: { lat: number; lon: number }[];
  costing: 'bicycle';
  units: 'kilometers';
  linear_cost_factors?: EdgeCostFactor[];
}

/**
 * Builds the Valhalla request body. Split out from getBikeRoute so that
 * safety-weighted routing (ADR 0001) arrives here as one added request
 * field, against infrastructure GPS4B already runs, rather than as a change
 * to the routing engine or the transport code.
 *
 * `linear_cost_factors` is Valhalla's request-time per-edge cost mechanism.
 * Nothing supplies it until Segment Scores exist, so the exact wire shape is
 * unexercised against a live instance; it is confined to this function
 * precisely so correcting it is a local edit.
 */
export function buildRouteRequest(
  from: RoutePoint,
  to: RoutePoint,
  options: RouteRequestOptions = {}
): ValhallaRouteRequest {
  const request: ValhallaRouteRequest = {
    locations: [
      { lat: from.latitude, lon: from.longitude },
      { lat: to.latitude, lon: to.longitude },
    ],
    costing: 'bicycle',
    units: 'kilometers',
  };
  if (options.costFactors && options.costFactors.length > 0) {
    request.linear_cost_factors = options.costFactors;
  }
  return request;
}

/** Stock bike routing — not weighted by GPS4B's own safety data (v0.3). */
export async function getBikeRoute(
  from: RoutePoint,
  to: RoutePoint,
  options: RouteRequestOptions = {}
): Promise<Route> {
  const response = await fetch(CONFIG.routingUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Id': CONFIG.routingClientId,
    },
    body: JSON.stringify(buildRouteRequest(from, to, options)),
  });
  if (!response.ok) throw new Error(`Routing failed: ${response.status}`);
  const body = await response.json();

  const leg = body.trip.legs[0];
  return {
    points: decodePolyline6(leg.shape),
    distanceMeters: body.trip.summary.length * 1000,
    durationSeconds: body.trip.summary.time,
    maneuvers: (leg.maneuvers ?? []).map((m: ValhallaManeuver) => ({
      instruction: m.instruction,
      distanceMeters: m.length * 1000,
    })),
  };
}

interface ValhallaManeuver {
  instruction: string;
  length: number;
}

/** Valhalla encodes shapes with 6 decimal places of precision. */
function decodePolyline6(encoded: string): RoutePoint[] {
  const points: RoutePoint[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    lat += decodeSignedValue();
    lon += decodeSignedValue();
    points.push({ latitude: lat / 1e6, longitude: lon / 1e6 });
  }
  return points;

  function decodeSignedValue(): number {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  }
}
