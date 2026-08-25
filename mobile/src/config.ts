/**
 * GPS4B mobile app configuration.
 *
 * Everything here is intentionally simple and adjustable. The GPS sampling
 * interval is the main tuning knob (spec target: one observation every
 * 3–10 seconds).
 */
export const CONFIG = {
  /** Base URL of the GPS4B backend. Point this at your server. */
  apiUrl: 'http://192.168.1.100:3000',

  /**
   * Geocoding (search bar) and bike-routing endpoints. These default to
   * public OSM community servers that explicitly forbid production/commercial
   * load — see mobile/README.md "Navigation services" — and are overridden at
   * startup by GET /config on the GPS4B server (see fetchRemoteConfig below).
   * OSMF's Nominatim policy requires the app be able to switch geocoding
   * services without a software update; routing the choice through the
   * backend, rather than hardcoding it here, is how that's satisfied.
   */
  geocodeUrl: 'https://api.openrouteservice.org/geocode/search',
  geocodeApiKey: '',
  routingUrl: 'https://valhalla1.openstreetmap.de/route',
  routingClientId: 'org.gps4b.app (dev)',

  /** Style URL for the MapLibre basemap (OpenFreeMap: no key, no quota). */
  mapStyleUrl: 'https://tiles.openfreemap.org/styles/liberty',

  /** Target time between GPS observations, in milliseconds. */
  gpsIntervalMs: 5000,

  /**
   * Minimum movement (meters) between observations. 0 means time-based only,
   * which keeps the series evenly spaced even when stopped at a light.
   */
  gpsDistanceIntervalMeters: 0,

  /** How often to retry uploading pending rides while the app is open (ms). */
  syncIntervalMs: 60_000,

  /** How often the recording screen refreshes its point counter (ms). */
  uiRefreshMs: 3000,
};

type RemoteConfig = Partial<
  Pick<typeof CONFIG, 'geocodeUrl' | 'geocodeApiKey' | 'routingUrl' | 'mapStyleUrl'>
>;

/**
 * Pulls navigation-service overrides from the backend so they can change
 * without an app release (required by Nominatim's usage policy, and useful
 * regardless once GPS4B runs its own routing/geocoding servers). Failure is
 * silent — the hardcoded defaults above are always a valid fallback.
 */
export async function fetchRemoteConfig(): Promise<void> {
  try {
    const response = await fetch(`${CONFIG.apiUrl}/config`);
    if (!response.ok) return;
    const remote: RemoteConfig = await response.json();
    for (const [key, value] of Object.entries(remote)) {
      if (value !== undefined && value !== null) {
        (CONFIG as Record<string, unknown>)[key] = value;
      }
    }
  } catch {
    // Offline or server unreachable — keep using defaults.
  }
}
