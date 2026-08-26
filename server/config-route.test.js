import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildClientConfig } from './config-route.js';

test('reports the navigation endpoints the operator has set', () => {
  const config = buildClientConfig({
    ROUTING_URL: 'https://routing.gps4b.org/route',
    GEOCODE_URL: 'https://api.openrouteservice.org/geocode/search',
    GEOCODE_API_KEY: 'key123',
    MAP_STYLE_URL: 'https://tiles.openfreemap.org/styles/liberty',
  });

  assert.deepEqual(config, {
    routingUrl: 'https://routing.gps4b.org/route',
    geocodeUrl: 'https://api.openrouteservice.org/geocode/search',
    geocodeApiKey: 'key123',
    mapStyleUrl: 'https://tiles.openfreemap.org/styles/liberty',
  });
});

// Clients merge this over their own defaults, so an unset or blank variable
// must be absent rather than present-and-empty: sending "" would blank out a
// working default and break routing for every client at once.
test('omits unset and blank variables instead of blanking client defaults', () => {
  assert.deepEqual(buildClientConfig({}), {});
  assert.deepEqual(buildClientConfig({ ROUTING_URL: '', GEOCODE_URL: '   ' }), {});
  assert.deepEqual(buildClientConfig({ ROUTING_URL: 'https://routing.gps4b.org/route' }), {
    routingUrl: 'https://routing.gps4b.org/route',
  });
});

// Cutting over to GPS4B's own Valhalla (ADR 0001) is exactly this: one
// environment variable on the API service, no app release.
test('cutting over to self-hosted routing is one variable', () => {
  const before = buildClientConfig({ ROUTING_URL: 'https://valhalla1.openstreetmap.de/route' });
  const after = buildClientConfig({ ROUTING_URL: 'https://routing.gps4b.org/route' });

  assert.notEqual(before.routingUrl, after.routingUrl);
  assert.deepEqual(Object.keys(before), Object.keys(after));
});
