/* eslint-env jest */
// MapLibre ships native modules that have no JS-only implementation; the
// Guidance tests never render the map, so a stub keeps App.tsx importable.
jest.mock('@maplibre/maplibre-react-native', () => ({
  Camera: 'Camera',
  GeoJSONSource: 'GeoJSONSource',
  Layer: 'Layer',
  Map: 'Map',
  Marker: 'Marker',
  UserLocation: 'UserLocation',
}));

// Ferrostar's binding is a compiled Rust module vendored per-platform
// (mobile/vendor/README.md); it does not exist under Node. Stubbing it keeps
// the startup smoke check quiet in unit tests — describeFerrostarNative's own
// tests inject their loader, so this stub never stands in for that coverage.
jest.mock(
  '@stadiamaps/ferrostar-uniffi-react-native',
  () => ({ NavigationController: 'NavigationController', RouteAdapter: 'RouteAdapter' }),
  { virtual: true }
);
