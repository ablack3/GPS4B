-- GPS4B v0.1 central database schema (base tables).
--
-- Raw GPS observations are the source of truth: they are immutable after
-- synchronization. Later processing (cleaning, map matching, scoring) derives
-- new datasets instead of modifying these tables.
--
-- The PostGIS geometry column lives in schema-postgis.sql so the server can
-- run on a database without PostGIS (it is applied when available). The
-- server runs both files automatically at startup; everything is idempotent.

CREATE TABLE IF NOT EXISTS users (
    id          text PRIMARY KEY,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rides (
    id          text PRIMARY KEY,
    user_id     text REFERENCES users (id),
    started_at  timestamptz NOT NULL,
    ended_at    timestamptz NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS location_points (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ride_id    text NOT NULL REFERENCES rides (id),
    "timestamp" timestamptz NOT NULL,
    latitude   double precision NOT NULL,
    longitude  double precision NOT NULL,
    accuracy   double precision,
    altitude   double precision,
    speed      double precision,
    heading    double precision,
    condition  text NOT NULL CHECK (condition IN ('SAFE', 'UNSAFE'))
);

CREATE INDEX IF NOT EXISTS idx_location_points_ride
    ON location_points (ride_id, "timestamp");

-- A HazardReport is a discrete, one-shot, geo-pinned observation of a
-- permanent infrastructure defect (a lane that ends, a rough surface, a
-- dangerous intersection) — distinct from Condition, which is a rider's
-- continuous SAFE/UNSAFE self-report over a stretch of a ride. Reports are
-- immutable after sync, same as location_points; map-matching them to OSM
-- ways is a derived dataset, built later, not stored here.
CREATE TABLE IF NOT EXISTS hazard_reports (
    id         text PRIMARY KEY,
    ride_id    text REFERENCES rides (id),
    "timestamp" timestamptz NOT NULL,
    latitude   double precision NOT NULL,
    longitude  double precision NOT NULL,
    type       text NOT NULL CHECK (type IN ('LANE_GAP', 'ROUGH_PAVEMENT', 'BAD_INTERSECTION')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hazard_reports_location
    ON hazard_reports (latitude, longitude);
