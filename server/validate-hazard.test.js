import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateHazardPayload } from './validate-hazard.js';

const validPayload = {
  id: 'hazard_123',
  ride_id: 'ride_123',
  timestamp: '2026-08-22T16:00:03Z',
  latitude: 42.3601,
  longitude: -71.0589,
  type: 'LANE_GAP',
};

test('accepts a valid payload', () => {
  assert.deepEqual(validateHazardPayload(validPayload), []);
});

test('accepts a payload without ride_id', () => {
  assert.deepEqual(validateHazardPayload({ ...validPayload, ride_id: undefined }), []);
});

test('rejects a non-object body', () => {
  assert.ok(validateHazardPayload(null).length > 0);
  assert.ok(validateHazardPayload('hi').length > 0);
  assert.ok(validateHazardPayload([1]).length > 0);
});

test('rejects a missing or empty id', () => {
  assert.ok(validateHazardPayload({ ...validPayload, id: undefined }).length > 0);
  assert.ok(validateHazardPayload({ ...validPayload, id: '' }).length > 0);
});

test('rejects a bad timestamp', () => {
  assert.ok(validateHazardPayload({ ...validPayload, timestamp: 'yesterday' }).length > 0);
});

test('rejects out-of-range coordinates', () => {
  assert.ok(
    validateHazardPayload({ ...validPayload, latitude: 91 }).some((e) => e.includes('latitude'))
  );
  assert.ok(
    validateHazardPayload({ ...validPayload, longitude: -181 }).some((e) =>
      e.includes('longitude')
    )
  );
});

test('rejects an unknown hazard type', () => {
  assert.ok(
    validateHazardPayload({ ...validPayload, type: 'POTHOLE' }).some((e) => e.includes('type'))
  );
});
