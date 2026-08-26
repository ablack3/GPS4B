/**
 * Imperial distance and duration formatting for Guidance and route previews.
 *
 * Miles/feet and English only this milestone (see issue #1) — these helpers
 * are the single place that assumption lives, so adding metric later is a
 * change here rather than a sweep through the UI.
 */

const METERS_PER_FOOT = 0.3048;
const METERS_PER_MILE = 1609.344;

/** Below this, distances read in feet; at or above it, in miles. */
const FEET_TO_MILES_THRESHOLD_FT = 1000;

/** Non-finite and negative inputs render as zero — a banner must never show NaN. */
function clampToZero(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * A distance as a rider reads it aloud: "150 ft", "0.2 mi", "16 mi".
 *
 * Feet are rounded to the nearest 10 because sub-10-foot precision is noise
 * at GPS accuracy, and a non-zero distance never rounds down to "0 ft" —
 * "10 ft" is the floor while the turn is still ahead.
 */
export function formatDistance(meters: number): string {
  const safe = clampToZero(meters);
  if (safe === 0) return '0 ft';

  const feet = safe / METERS_PER_FOOT;
  if (feet < FEET_TO_MILES_THRESHOLD_FT) {
    return `${Math.max(10, Math.round(feet / 10) * 10)} ft`;
  }

  const miles = safe / METERS_PER_MILE;
  // Past 10 miles the decimal is noise and costs banner width.
  return miles >= 10 ? `${Math.round(miles)} mi` : `${miles.toFixed(1)} mi`;
}

/** A remaining-time as a rider reads it: "<1 min", "25 min", "1 hr 5 min". */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.floor(clampToZero(seconds) / 60);
  if (totalMinutes < 1) return '<1 min';
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}
