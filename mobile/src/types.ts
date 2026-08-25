/** Rider-reported condition of the current portion of the ride. */
export type Condition = 'SAFE' | 'UNSAFE';

/** Lifecycle of a ride with respect to the backend. */
export type SyncStatus = 'LOCAL' | 'PENDING' | 'UPLOADING' | 'SYNCED';

export interface Ride {
  id: string;
  started_at: string; // ISO 8601
  ended_at: string | null; // ISO 8601, null while recording
  current_condition: Condition;
  sync_status: SyncStatus;
  created_at: string;
}

export interface LocationPoint {
  id: number;
  ride_id: string;
  timestamp: string; // ISO 8601
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  condition: Condition;
}

/**
 * Permanent-infrastructure defect a rider flags at a point in time, distinct
 * from Condition: a HazardReport is discrete and describes the place, not
 * the ride. Deliberately excludes temporary hazards (double-parked cars,
 * debris) — those need an expiry model this version doesn't have.
 */
export type HazardType = 'LANE_GAP' | 'ROUGH_PAVEMENT' | 'BAD_INTERSECTION';

export interface HazardReport {
  id: string;
  ride_id: string | null;
  timestamp: string; // ISO 8601
  latitude: number;
  longitude: number;
  type: HazardType;
  sync_status: SyncStatus;
}
