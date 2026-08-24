/**
 * GPS4B mobile app configuration.
 *
 * Everything here is intentionally simple and adjustable. The GPS sampling
 * interval is the main tuning knob (spec target: one observation every
 * 3–10 seconds).
 */
export const CONFIG = {
  /** Base URL of the GPS4B backend. Point this at your server. */
  apiUrl: 'http://192.168.1.100:3000',

  /** Target time between GPS observations, in milliseconds. */
  gpsIntervalMs: 5000,

  /**
   * Minimum movement (meters) between observations. 0 means time-based only,
   * which keeps the series evenly spaced even when stopped at a light.
   */
  gpsDistanceIntervalMeters: 0,

  /** How often to retry uploading pending rides while the app is open (ms). */
  syncIntervalMs: 60_000,

  /** How often the recording screen refreshes its point counter (ms). */
  uiRefreshMs: 3000,
};
