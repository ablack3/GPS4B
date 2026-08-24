/**
 * Validation for the POST /rides payload.
 *
 * Pure functions, no I/O — easy to unit test. Returns a list of human-readable
 * problems; an empty list means the payload is acceptable.
 */

const CONDITIONS = new Set(['SAFE', 'UNSAFE']);
const MAX_ID_LENGTH = 128;
const MAX_POINTS = 200_000; // ~ several days of riding at 5s intervals

function isNonEmptyString(value, maxLength = MAX_ID_LENGTH) {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= maxLength
  );
}

function isIsoTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isOptionalFiniteNumber(value) {
  return value === undefined || value === null || Number.isFinite(value);
}

/**
 * @returns {string[]} problems found (empty array = valid)
 */
export function validateRidePayload(body) {
  const errors = [];

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return ['request body must be a JSON object'];
  }

  if (!isNonEmptyString(body.ride_id)) {
    errors.push(`ride_id must be a non-empty string (max ${MAX_ID_LENGTH} chars)`);
  }
  if (body.user_id !== undefined && body.user_id !== null && !isNonEmptyString(body.user_id)) {
    errors.push(`user_id, when present, must be a non-empty string (max ${MAX_ID_LENGTH} chars)`);
  }
  if (!isIsoTimestamp(body.started_at)) {
    errors.push('started_at must be an ISO 8601 timestamp');
  }
  if (!isIsoTimestamp(body.ended_at)) {
    errors.push('ended_at must be an ISO 8601 timestamp');
  }

  if (!Array.isArray(body.points)) {
    errors.push('points must be an array');
    return errors;
  }
  if (body.points.length > MAX_POINTS) {
    errors.push(`points must contain at most ${MAX_POINTS} entries`);
    return errors;
  }

  body.points.forEach((point, i) => {
    const pointErrors = validatePoint(point);
    for (const problem of pointErrors) {
      errors.push(`points[${i}]: ${problem}`);
    }
    // Avoid flooding the response for a systematically broken payload.
    if (errors.length > 20) {
      errors.push('(further problems omitted)');
      return errors;
    }
  });

  return errors.slice(0, 21);
}

function validatePoint(point) {
  if (typeof point !== 'object' || point === null || Array.isArray(point)) {
    return ['must be an object'];
  }
  const errors = [];
  if (!isIsoTimestamp(point.timestamp)) {
    errors.push('timestamp must be an ISO 8601 timestamp');
  }
  if (!Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90) {
    errors.push('latitude must be a number between -90 and 90');
  }
  if (!Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180) {
    errors.push('longitude must be a number between -180 and 180');
  }
  if (!CONDITIONS.has(point.condition)) {
    errors.push('condition must be SAFE or UNSAFE');
  }
  for (const field of ['accuracy', 'altitude', 'speed', 'heading']) {
    if (!isOptionalFiniteNumber(point[field])) {
      errors.push(`${field}, when present, must be a number`);
    }
  }
  return errors;
}
