/**
 * Ride lifecycle: start, annotate, stop.
 */
import type { Condition, Ride } from './types';
import {
  completeRide,
  createRide,
  getActiveRide,
  setRideCondition,
} from './db';
import {
  requestLocationPermissions,
  startTracking,
  stopTracking,
} from './location';
import { syncPendingRides } from './sync';

export type StartRideResult =
  | { ok: true; ride: Ride; backgroundGranted: boolean }
  | { ok: false; reason: 'permission-denied' };

export async function startRide(): Promise<StartRideResult> {
  const existing = getActiveRide();
  if (existing) {
    // Already recording (e.g. the app restarted mid-ride) — just resume.
    return { ok: true, ride: existing, backgroundGranted: true };
  }

  const perms = await requestLocationPermissions();
  if (!perms.foreground) {
    return { ok: false, reason: 'permission-denied' };
  }

  // Create and persist the ride before tracking starts so the very first
  // location batch already has a ride (and default condition) to attach to.
  const ride = createRide('SAFE');
  await startTracking();
  return { ok: true, ride, backgroundGranted: perms.background };
}

export function changeCondition(rideId: string, condition: Condition): void {
  setRideCondition(rideId, condition);
}

export async function stopRide(rideId: string): Promise<void> {
  // Stop GPS first so no points arrive after the ride is marked complete.
  await stopTracking();
  completeRide(rideId);

  // Opportunistic upload; failures leave the ride queued (PENDING) and it
  // will be retried later. Never blocks ride completion.
  syncPendingRides().catch(() => {});
}
