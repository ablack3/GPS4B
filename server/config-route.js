/**
 * The payload behind `GET /config`.
 *
 * Clients (mobile/src/config.ts, web/app.js) start with hardcoded defaults and
 * merge this over them at startup. That indirection is required by OSMF's
 * Nominatim usage policy — the app must be able to switch geocoding services
 * without a software update — and it is also how GPS4B repoints riders at its
 * own Valhalla instance (ADR 0001) without shipping a release.
 */

const KEYS = {
  ROUTING_URL: 'routingUrl',
  GEOCODE_URL: 'geocodeUrl',
  GEOCODE_API_KEY: 'geocodeApiKey',
  MAP_STYLE_URL: 'mapStyleUrl',
};

/**
 * Only variables the operator actually set are reported. A blank value is
 * treated as unset: clients merge non-null values over their defaults, so
 * sending "" would blank out a working default rather than leave it alone.
 */
export function buildClientConfig(env) {
  const config = {};
  for (const [variable, key] of Object.entries(KEYS)) {
    const value = env[variable];
    if (typeof value === 'string' && value.trim() !== '') config[key] = value;
  }
  return config;
}
