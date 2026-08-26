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
