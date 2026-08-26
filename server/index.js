/**
 * GPS4B v0.1 backend.
 *
 * A deliberately small HTTP API:
 *
 *   POST /rides      — accept a completed ride with its GPS observations
 *   GET  /rides/:id  — read a stored ride back (verification/debugging)
 *   POST /hazards    — accept a rider-reported permanent-infrastructure hazard
 *   GET  /hazards    — read hazards back, optionally filtered to a bbox
 *   GET  /health     — liveness + database connectivity check
 *
 * Uploads are idempotent on ride_id: re-sending a ride that was already
 * stored succeeds without creating duplicates, so the mobile app can retry
 * freely.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import pg from 'pg';

import { validateRidePayload } from './validate.js';
import { validateHazardPayload } from './validate-hazard.js';
import { buildClientConfig } from './config-route.js';

const PORT = Number(process.env.PORT ?? 3000);
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://gps4b:gps4b@localhost:5432/gps4b';

// Managed databases reached over the public internet (e.g. Render's external
// hostname) require TLS; local and internal-network connections do not.
const useSsl =
  process.env.DATABASE_SSL === 'true' || /\.render\.com/.test(DATABASE_URL);

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Create the schema if it does not exist yet (idempotent). Managed Postgres
 * providers don't run schema.sql for us the way the docker-compose image
 * does, so the server bootstraps its own tables. The PostGIS layer is
 * optional: applied where the extension is available, skipped otherwise.
 */
async function ensureSchema() {
  const base = await readFile(path.join(here, 'schema.sql'), 'utf8');
  await pool.query(base);
  try {
    const postgis = await readFile(path.join(here, 'schema-postgis.sql'), 'utf8');
    await pool.query(postgis);
    console.log('PostGIS layer applied (geometry column + spatial index)');
  } catch (err) {
    console.warn('PostGIS unavailable — running without geometry column:', err.message);
  }
}

const app = express();
app.use(express.json({ limit: '50mb' }));

// CORS: the GPS4B web app runs on a different origin (e.g. GitHub Pages)
// and syncs rides directly from the browser. The API is open by design in
// v0.1 (no authentication), so a permissive CORS policy costs nothing.
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Lets the mobile/web app pick up a new geocoding/routing/basemap endpoint
// without a release — required by the OSM Nominatim usage policy, and the
// mechanism for moving off public dev servers onto GPS4B's own once deployed.
app.get('/config', (_req, res) => {
  res.json(buildClientConfig(process.env));
});

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ status: 'database_unreachable', error: err.message });
  }
});

app.post('/rides', async (req, res) => {
  const errors = validateRidePayload(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'invalid_payload', details: errors });
  }

  const { ride_id, user_id, started_at, ended_at, points } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (user_id) {
      await client.query(
        'INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
        [user_id]
      );
    }

    const inserted = await client.query(
      `INSERT INTO rides (id, user_id, started_at, ended_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [ride_id, user_id ?? null, started_at, ended_at]
    );

    if (inserted.rowCount === 0) {
      // Ride already stored by an earlier attempt — idempotent success.
      await client.query('ROLLBACK');
      return res.status(200).json({ status: 'already_synced', ride_id });
    }

    await insertPoints(client, ride_id, points);

    await client.query('COMMIT');
    res.status(201).json({ status: 'stored', ride_id, point_count: points.length });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Failed to store ride', ride_id, err);
    res.status(500).json({ error: 'storage_failed' });
  } finally {
    client.release();
  }
});

// Multi-row inserts in chunks: fast enough for whole-ride batches while
// staying far below PostgreSQL's parameter limit.
const POINT_COLUMNS = 9;
const CHUNK_SIZE = 1000;

async function insertPoints(client, rideId, points) {
  for (let start = 0; start < points.length; start += CHUNK_SIZE) {
    const chunk = points.slice(start, start + CHUNK_SIZE);
    const values = [];
    const placeholders = chunk.map((p, i) => {
      const base = i * POINT_COLUMNS;
      values.push(
        rideId,
        p.timestamp,
        p.latitude,
        p.longitude,
        p.accuracy ?? null,
        p.altitude ?? null,
        p.speed ?? null,
        p.heading ?? null,
        p.condition
      );
      const slots = Array.from({ length: POINT_COLUMNS }, (_, j) => `$${base + j + 1}`);
      return `(${slots.join(', ')})`;
    });
    await client.query(
      `INSERT INTO location_points
         (ride_id, "timestamp", latitude, longitude, accuracy, altitude, speed, heading, condition)
       VALUES ${placeholders.join(', ')}`,
      values
    );
  }
}

app.get('/rides/:id', async (req, res) => {
  try {
    const ride = await pool.query('SELECT * FROM rides WHERE id = $1', [
      req.params.id,
    ]);
    if (ride.rowCount === 0) {
      return res.status(404).json({ error: 'ride_not_found' });
    }
    const points = await pool.query(
      `SELECT "timestamp", latitude, longitude, accuracy, altitude, speed, heading, condition
       FROM location_points
       WHERE ride_id = $1
       ORDER BY "timestamp" ASC, id ASC`,
      [req.params.id]
    );
    res.json({ ...ride.rows[0], points: points.rows });
  } catch (err) {
    console.error('Failed to read ride', req.params.id, err);
    res.status(500).json({ error: 'read_failed' });
  }
});

app.post('/hazards', async (req, res) => {
  const errors = validateHazardPayload(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'invalid_payload', details: errors });
  }

  const { id, ride_id, timestamp, latitude, longitude, type } = req.body;

  try {
    const inserted = await pool.query(
      `INSERT INTO hazard_reports (id, ride_id, "timestamp", latitude, longitude, type)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [id, ride_id ?? null, timestamp, latitude, longitude, type]
    );
    if (inserted.rowCount === 0) {
      return res.status(200).json({ status: 'already_synced', id });
    }
    res.status(201).json({ status: 'stored', id });
  } catch (err) {
    console.error('Failed to store hazard report', id, err);
    res.status(500).json({ error: 'storage_failed' });
  }
});

// bbox = minLon,minLat,maxLon,maxLat — matches the convention used by OSM
// routing/geocoding APIs, so the mobile app can reuse the same viewport
// value it already computes for the map.
app.get('/hazards', async (req, res) => {
  const { bbox } = req.query;
  try {
    if (bbox === undefined) {
      const all = await pool.query(
        `SELECT id, ride_id, "timestamp", latitude, longitude, type
         FROM hazard_reports ORDER BY "timestamp" DESC LIMIT 10000`
      );
      return res.json({ hazards: all.rows });
    }

    const parts = String(bbox).split(',').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      return res.status(400).json({ error: 'invalid_bbox' });
    }
    const [minLon, minLat, maxLon, maxLat] = parts;
    const inBbox = await pool.query(
      `SELECT id, ride_id, "timestamp", latitude, longitude, type
       FROM hazard_reports
       WHERE longitude BETWEEN $1 AND $3 AND latitude BETWEEN $2 AND $4
       ORDER BY "timestamp" DESC LIMIT 10000`,
      [minLon, minLat, maxLon, maxLat]
    );
    res.json({ hazards: inBbox.rows });
  } catch (err) {
    console.error('Failed to read hazards', err);
    res.status(500).json({ error: 'read_failed' });
  }
});

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`GPS4B server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    // Exit so the platform restarts us; covers a database that is still
    // starting up when the service boots.
    console.error('Failed to initialize database schema:', err);
    process.exit(1);
  });
