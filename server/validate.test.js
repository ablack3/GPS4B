import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateRidePayload } from './validate.js';

const validPoint = {
  timestamp: '2026-08-22T16:00:03Z',
  latitude: 42.3601,
  longitude: -71.0589,
  accuracy: 4.2,
  condition: 'SAFE',
};

const validPayload = {
  ride_id: 'ride_123',
  user_id: 'user_abc',
  started_at: '2026-08-22T16:00:00Z',
  ended_at: '2026-08-22T16:32:00Z',
  points: [validPoint, { ...validPoint, condition: 'UNSAFE' }],
};

test('accepts a valid payload', () => {
  assert.deepEqual(validateRidePayload(validPayload), []);
});

test('accepts a payload without user_id or optional point fields', () => {
  const payload = {
    ...validPayload,
    user_id: undefined,
    points: [
      {
        timestamp: '2026-08-22T16:00:03Z',
        latitude: 0,
        longitude: 0,
        condition: 'UNSAFE',
      },
    ],
  };
  assert.deepEqual(validateRidePayload(payload), []);
});

test('accepts null optional point fields', () => {
  const payload = {
    ...validPayload,
    points: [{ ...validPoint, accuracy: null, altitude: null, speed: null, heading: null }],
  };
  assert.deepEqual(validateRidePayload(payload), []);
});

test('rejects a non-object body', () => {
  assert.ok(validateRidePayload(null).length > 0);
  assert.ok(validateRidePayload('hi').length > 0);
  assert.ok(validateRidePayload([1]).length > 0);
});

test('rejects a missing or empty ride_id', () => {
  assert.ok(validateRidePayload({ ...validPayload, ride_id: undefined }).length > 0);
  assert.ok(validateRidePayload({ ...validPayload, ride_id: '' }).length > 0);
});

test('rejects bad timestamps', () => {
  assert.ok(validateRidePayload({ ...validPayload, started_at: 'yesterday' }).length > 0);
  assert.ok(validateRidePayload({ ...validPayload, ended_at: 12345 }).length > 0);
});

test('rejects missing points array', () => {
  assert.ok(validateRidePayload({ ...validPayload, points: undefined }).length > 0);
});

test('rejects out-of-range coordinates', () => {
  const bad = { ...validPayload, points: [{ ...validPoint, latitude: 91 }] };
  assert.ok(validateRidePayload(bad).some((e) => e.includes('latitude')));
  const bad2 = { ...validPayload, points: [{ ...validPoint, longitude: -181 }] };
  assert.ok(validateRidePayload(bad2).some((e) => e.includes('longitude')));
});

test('rejects unknown conditions', () => {
  const bad = { ...validPayload, points: [{ ...validPoint, condition: 'MEH' }] };
  assert.ok(validateRidePayload(bad).some((e) => e.includes('condition')));
});

test('rejects non-numeric optional fields', () => {
  const bad = { ...validPayload, points: [{ ...validPoint, speed: 'fast' }] };
  assert.ok(validateRidePayload(bad).some((e) => e.includes('speed')));
});

test('caps the number of reported problems', () => {
  const bad = {
    ...validPayload,
    points: Array.from({ length: 50 }, () => ({ bogus: true })),
  };
  assert.ok(validateRidePayload(bad).length <= 25);
});
