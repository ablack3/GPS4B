/**
 * Validation for the POST /hazards payload.
 *
 * Pure functions, no I/O — mirrors validate.js's shape for ride payloads.
 * Returns a list of human-readable problems; an empty list means the
 * payload is acceptable.
 */

const HAZARD_TYPES = new Set(['LANE_GAP', 'ROUGH_PAVEMENT', 'BAD_INTERSECTION']);
const MAX_ID_LENGTH = 128;

function isNonEmptyString(value, maxLength = MAX_ID_LENGTH) {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= maxLength
  );
}

function isIsoTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

/**
 * @returns {string[]} problems found (empty array = valid)
 */
export function validateHazardPayload(body) {
  const errors = [];

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return ['request body must be a JSON object'];
  }

  if (!isNonEmptyString(body.id)) {
    errors.push(`id must be a non-empty string (max ${MAX_ID_LENGTH} chars)`);
  }
  if (body.ride_id !== undefined && body.ride_id !== null && !isNonEmptyString(body.ride_id)) {
    errors.push(`ride_id, when present, must be a non-empty string (max ${MAX_ID_LENGTH} chars)`);
  }
  if (!isIsoTimestamp(body.timestamp)) {
    errors.push('timestamp must be an ISO 8601 timestamp');
  }
  if (!Number.isFinite(body.latitude) || body.latitude < -90 || body.latitude > 90) {
    errors.push('latitude must be a number between -90 and 90');
  }
  if (!Number.isFinite(body.longitude) || body.longitude < -180 || body.longitude > 180) {
    errors.push('longitude must be a number between -180 and 180');
  }
  if (!HAZARD_TYPES.has(body.type)) {
    errors.push('type must be one of LANE_GAP, ROUGH_PAVEMENT, BAD_INTERSECTION');
  }

  return errors;
}
