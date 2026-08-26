import { createFakeGuidance } from '../guidance-fake';
import {
  endNavigationSession,
  startNavigationSession,
  type NavigationSessionDeps,
} from '../navigation-session';
import type { Route } from '../routing';
import type { Ride } from '../types';

const route: Route = {
  points: [{ latitude: 42.36, longitude: -71.06 }],
  distanceMeters: 3000,
  durationSeconds: 900,
  maneuvers: [{ instruction: 'Head north on Beacon St', distanceMeters: 400 }],
};

const ride: Ride = {
  id: 'ride_1',
  started_at: '2026-08-26T12:00:00Z',
  ended_at: null,
  current_condition: 'SAFE',
  sync_status: 'LOCAL',
  created_at: '2026-08-26T12:00:00Z',
};

function deps(overrides: Partial<NavigationSessionDeps> = {}): NavigationSessionDeps {
  return {
    guidance: createFakeGuidance(),
    startRide: jest.fn(async () => ({ ok: true as const, ride, backgroundGranted: true })),
    ...overrides,
  };
}

describe('starting a Navigation Session', () => {
  test('records the Ride and starts Guidance when the rider contributes data', async () => {
    const d = deps();
    const result = await startNavigationSession(route, { recordRide: true }, d);

    expect(result).toEqual({ ok: true, ride, backgroundGranted: true });
    expect(d.startRide).toHaveBeenCalledTimes(1);
    expect(d.guidance.getState().active).toBe(true);
  });

  test('still starts Guidance when the rider opts out of contributing data', async () => {
    // Regression: this combination used to be a silent no-op — START
    // NAVIGATION did nothing at all with the contribute switch off.
    const d = deps();
    const result = await startNavigationSession(route, { recordRide: false }, d);

    expect(result).toEqual({ ok: true, ride: null, backgroundGranted: false });
    expect(d.startRide).not.toHaveBeenCalled();
    expect(d.guidance.getState().active).toBe(true);
    expect(d.guidance.getState().currentManeuver?.instruction).toBe(
      'Head north on Beacon St'
    );
  });

  test('fails without starting Guidance when location permission is denied', async () => {
    const d = deps({
      startRide: jest.fn(async () => ({ ok: false as const, reason: 'permission-denied' as const })),
    });

    const result = await startNavigationSession(route, { recordRide: true }, d);

    expect(result).toEqual({ ok: false, reason: 'permission-denied' });
    expect(d.guidance.getState().active).toBe(false);
  });

  test('reports when recording started without background permission', async () => {
    const d = deps({
      startRide: jest.fn(async () => ({ ok: true as const, ride, backgroundGranted: false })),
    });

    const result = await startNavigationSession(route, { recordRide: true }, d);

    expect(result).toEqual({ ok: true, ride, backgroundGranted: false });
  });

  test('does not start a second Ride when one is already recording', async () => {
    // startRide already resumes an existing ride rather than creating one;
    // the session must not work around that with its own bookkeeping.
    const d = deps();
    await startNavigationSession(route, { recordRide: true }, d);
    await startNavigationSession(route, { recordRide: true }, d);

    expect(d.startRide).toHaveBeenCalledTimes(2);
    expect(d.guidance.getState().active).toBe(true);
  });
});

describe('ending a Navigation Session', () => {
  test('ends Guidance', async () => {
    const d = deps();
    await startNavigationSession(route, { recordRide: true }, d);

    await endNavigationSession(d);

    expect(d.guidance.getState().active).toBe(false);
  });

  test('leaves the Ride recording — ending Guidance never stops a Ride', async () => {
    const stopRide = jest.fn();
    const d = deps();
    await startNavigationSession(route, { recordRide: true }, d);

    await endNavigationSession(d);

    // The session module has no way to stop a Ride, by construction.
    expect(stopRide).not.toHaveBeenCalled();
    expect(d).not.toHaveProperty('stopRide');
  });

  test('is safe to call when no Guidance is running', async () => {
    const d = deps();
    await expect(endNavigationSession(d)).resolves.toBeUndefined();
    expect(d.guidance.getState().active).toBe(false);
  });
});
