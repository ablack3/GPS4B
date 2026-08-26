#!/usr/bin/env bash
#
# Verify a Valhalla instance actually routes a bicycle across Boston.
#
# Checks the same request shape the clients send (mobile/src/routing.ts
# buildRouteRequest, web/nav.js), so a pass means route preview will work.
#
# Usage: ./smoke-test.sh https://routing.gps4b.org

set -euo pipefail

BASE="${1:?usage: smoke-test.sh <base-url>}"

# Boston Common -> Harvard Square: ~5 km, entirely inside the Massachusetts
# extract, and a route any bicycle-costed graph must find.
request='{
  "locations": [
    { "lat": 42.3550, "lon": -71.0656 },
    { "lat": 42.3736, "lon": -71.1190 }
  ],
  "costing": "bicycle",
  "units": "kilometers"
}'

echo "==> POST $BASE/route"
body="$(curl -fsS --max-time 30 -X POST "$BASE/route" \
  -H 'Content-Type: application/json' \
  -H 'X-Client-Id: org.gps4b.smoke-test' \
  -d "$request")" || { echo "FAIL: routing request errored"; exit 1; }

length="$(printf '%s' "$body" | node -e '
  let raw = "";
  process.stdin.on("data", (d) => (raw += d));
  process.stdin.on("end", () => {
    const trip = JSON.parse(raw).trip;
    const leg = trip && trip.legs && trip.legs[0];
    if (!leg || !leg.shape || !leg.shape.length) { console.error("no leg shape"); process.exit(1); }
    if (!leg.maneuvers || !leg.maneuvers.length) { console.error("no maneuvers"); process.exit(1); }
    console.log(trip.summary.length);
  });
')" || { echo "FAIL: response was not a usable bicycle route"; exit 1; }

# Sanity band: the straight line is ~4.5 km; anything under 3 or over 20 means
# a broken graph, not a plausible bike route.
awk -v l="$length" 'BEGIN { exit !(l > 3 && l < 20) }' \
  || { echo "FAIL: implausible route length ${length} km"; exit 1; }

echo "==> OK: ${length} km bicycle route with maneuvers"
