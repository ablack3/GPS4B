/**
 * Local persistence for rides and GPS observations.
 *
 * Everything is written to SQLite first so the app works with no network
 * connection. Completed rides stay on the device until the server has
 * confirmed the upload (sync_status = SYNCED).
 *
 * This module is also used from the background location task, so it must not
 * depend on any React state.
 */
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';

import type { Condition, LocationPoint, Ride, SyncStatus } from './types';

const db = SQLite.openDatabaseSync('gps4b.db');

function initDb(): void {
  db.execSync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rides (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      current_condition TEXT NOT NULL DEFAULT 'GOOD',
      sync_status TEXT NOT NULL DEFAULT 'LOCAL',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS location_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ride_id TEXT NOT NULL REFERENCES rides(id),
      timestamp TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      accuracy REAL,
      altitude REAL,
      speed REAL,
      heading REAL,
      condition TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_location_points_ride
      ON location_points (ride_id, timestamp);
  `);
}

// Initialize at module load so the schema exists before any caller touches
// the database — including the background location task on a headless launch.
initDb();

/**
 * Anonymous, persistent installation identifier (no accounts in v0.1).
 * Lets the backend associate rides from the same installation.
 */
export function getOrCreateUserId(): string {
  const row = db.getFirstSync<{ value: string }>(
    'SELECT value FROM kv WHERE key = ?',
    'user_id'
  );
  if (row) return row.value;
  const userId = `user_${Crypto.randomUUID()}`;
  db.runSync('INSERT INTO kv (key, value) VALUES (?, ?)', 'user_id', userId);
  return userId;
}

export function createRide(condition: Condition = 'GOOD'): Ride {
  const now = new Date().toISOString();
  const ride: Ride = {
    id: `ride_${Crypto.randomUUID()}`,
    started_at: now,
    ended_at: null,
    current_condition: condition,
    sync_status: 'LOCAL',
    created_at: now,
  };
  db.runSync(
    `INSERT INTO rides (id, started_at, ended_at, current_condition, sync_status, created_at)
     VALUES (?, ?, NULL, ?, ?, ?)`,
    ride.id,
    ride.started_at,
    ride.current_condition,
    ride.sync_status,
    ride.created_at
  );
  return ride;
}

/** The ride currently being recorded, if any (at most one at a time). */
export function getActiveRide(): Ride | null {
  return (
    db.getFirstSync<Ride>(
      'SELECT * FROM rides WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
    ) ?? null
  );
}

export function setRideCondition(rideId: string, condition: Condition): void {
  db.runSync('UPDATE rides SET current_condition = ? WHERE id = ?', condition, rideId);
}

/**
 * Persist a batch of GPS observations. Each point inherits the condition that
 * is active at the time it is stored.
 */
export function insertPoints(
  rideId: string,
  condition: Condition,
  points: Array<{
    timestamp: string;
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    altitude?: number | null;
    speed?: number | null;
    heading?: number | null;
  }>
): void {
  db.withTransactionSync(() => {
    for (const p of points) {
      db.runSync(
        `INSERT INTO location_points
           (ride_id, timestamp, latitude, longitude, accuracy, altitude, speed, heading, condition)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        rideId,
        p.timestamp,
        p.latitude,
        p.longitude,
        p.accuracy ?? null,
        p.altitude ?? null,
        p.speed ?? null,
        p.heading ?? null,
        condition
      );
    }
  });
}

/** Mark a ride finished and queue it for upload. */
export function completeRide(rideId: string): void {
  db.runSync(
    "UPDATE rides SET ended_at = ?, sync_status = 'PENDING' WHERE id = ?",
    new Date().toISOString(),
    rideId
  );
}

export function setRideSyncStatus(rideId: string, status: SyncStatus): void {
  db.runSync('UPDATE rides SET sync_status = ? WHERE id = ?', status, rideId);
}

/** Completed rides that still need to reach the backend. */
export function getRidesToSync(): Ride[] {
  return db.getAllSync<Ride>(
    `SELECT * FROM rides
     WHERE ended_at IS NOT NULL AND sync_status IN ('PENDING', 'UPLOADING')
     ORDER BY started_at ASC`
  );
}

export function getRidePoints(rideId: string): LocationPoint[] {
  return db.getAllSync<LocationPoint>(
    'SELECT * FROM location_points WHERE ride_id = ? ORDER BY timestamp ASC, id ASC',
    rideId
  );
}

export function countRidePoints(rideId: string): number {
  const row = db.getFirstSync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM location_points WHERE ride_id = ?',
    rideId
  );
  return row?.n ?? 0;
}

/**
 * Startup recovery: an upload interrupted by the app being killed must not
 * stay stuck in UPLOADING — put it back in the queue.
 */
export function resetInterruptedUploads(): void {
  db.runSync(
    "UPDATE rides SET sync_status = 'PENDING' WHERE sync_status = 'UPLOADING'"
  );
}
