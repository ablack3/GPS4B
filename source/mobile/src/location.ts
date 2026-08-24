/**
 * Background GPS collection.
 *
 * A TaskManager task receives batched location updates from the OS — including
 * while the screen is locked or the app is backgrounded — and writes them
 * straight into SQLite with the ride's currently selected condition.
 *
 * The task is defined at module scope so it is registered as soon as the app's
 * JS bundle loads (a TaskManager requirement).
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { CONFIG } from './config';
import { getActiveRide, insertPoints } from './db';

export const LOCATION_TASK = 'gps4b-location-tracking';

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  LOCATION_TASK,
  async ({ data, error }) => {
    if (error) {
      console.warn('Location task error:', error.message);
      return;
    }
    if (!data?.locations?.length) return;

    // The active ride row carries the currently selected condition, so the
    // background task needs no React state to annotate points correctly.
    const ride = getActiveRide();
    if (!ride) return;

    insertPoints(
      ride.id,
      ride.current_condition,
      data.locations.map((loc) => ({
        timestamp: new Date(loc.timestamp).toISOString(),
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy,
        altitude: loc.coords.altitude,
        speed: loc.coords.speed,
        heading: loc.coords.heading,
      }))
    );
  }
);

/**
 * Request the permissions needed to record a ride.
 * Returns whether foreground and background access were granted.
 */
export async function requestLocationPermissions(): Promise<{
  foreground: boolean;
  background: boolean;
}> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    return { foreground: false, background: false };
  }
  // Background permission keeps recording while the phone is locked or the
  // app is in the background — a core requirement. On Android this may send
  // the user to system settings ("Allow all the time").
  const bg = await Location.requestBackgroundPermissionsAsync();
  return { foreground: true, background: bg.status === 'granted' };
}

export async function startTracking(): Promise<void> {
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: CONFIG.gpsIntervalMs,
    distanceInterval: CONFIG.gpsDistanceIntervalMeters,
    activityType: Location.ActivityType.Fitness,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true, // iOS: make recording obvious
    foregroundService: {
      // Android: a visible foreground service is what keeps recording alive.
      notificationTitle: 'GPS4B — recording ride',
      notificationBody: 'Your route is being recorded. Open GPS4B to stop.',
      notificationColor: '#2e7d32',
    },
  });
}

export async function stopTracking(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}

export async function isTracking(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
}
