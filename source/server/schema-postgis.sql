-- PostGIS layer: a derived geometry column plus spatial index, so later
-- geospatial analysis (map matching, segment scoring) is easy. Applied only
-- where the PostGIS extension is available; the API works without it.

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE location_points
    ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326)
        GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED;

CREATE INDEX IF NOT EXISTS idx_location_points_geom
    ON location_points USING gist (geom);
