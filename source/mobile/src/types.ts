/** Rider-reported condition of the current portion of the ride. */
export type Condition = 'GOOD' | 'BAD';

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
