/**
 * Upload completed rides to the backend.
 *
 * Whole rides are uploaded in one batch (ride metadata + all points).
 * A failed upload leaves the local data untouched and the ride back in
 * PENDING, so syncing is always retryable. The server deduplicates by
 * ride_id, so retrying a ride that actually made it through is harmless.
 */
import * as Network from 'expo-network';

import { CONFIG } from './config';
import {
  getHazardReportsToSync,
  getOrCreateUserId,
  getRidePoints,
  getRidesToSync,
  setHazardReportSyncStatus,
  setRideSyncStatus,
} from './db';

let syncInFlight = false;

export async function syncPendingRides(): Promise<void> {
  if (syncInFlight) return;
  syncInFlight = true;
  try {
    const rides = getRidesToSync();
    const hazards = getHazardReportsToSync();
    if (rides.length === 0 && hazards.length === 0) return;

    const network = await Network.getNetworkStateAsync();
    if (!network.isConnected) return;

    const userId = getOrCreateUserId();

    for (const hazard of hazards) {
      setHazardReportSyncStatus(hazard.id, 'UPLOADING');
      try {
        const response = await fetch(`${CONFIG.apiUrl}/hazards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(hazard),
        });
        setHazardReportSyncStatus(hazard.id, response.ok ? 'SYNCED' : 'PENDING');
      } catch {
        setHazardReportSyncStatus(hazard.id, 'PENDING');
      }
    }

    for (const ride of rides) {
      setRideSyncStatus(ride.id, 'UPLOADING');
      try {
        const points = getRidePoints(ride.id);
        const response = await fetch(`${CONFIG.apiUrl}/rides`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ride_id: ride.id,
            user_id: userId,
            started_at: ride.started_at,
            ended_at: ride.ended_at,
            points: points.map((p) => ({
              timestamp: p.timestamp,
              latitude: p.latitude,
              longitude: p.longitude,
              accuracy: p.accuracy,
              altitude: p.altitude,
              speed: p.speed,
              heading: p.heading,
              condition: p.condition,
            })),
          }),
        });

        if (response.ok) {
          setRideSyncStatus(ride.id, 'SYNCED');
        } else {
          setRideSyncStatus(ride.id, 'PENDING');
        }
      } catch {
        // Network error mid-upload — keep the data, try again later.
        setRideSyncStatus(ride.id, 'PENDING');
      }
    }
  } catch {
    // Syncing is opportunistic and always retried later — never throw.
  } finally {
    syncInFlight = false;
  }
}
