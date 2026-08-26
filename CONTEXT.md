# GPS4B

Bike-safety navigation for Boston: riders record and annotate their rides, the
data becomes a safety-scored map, and routing sends riders down the safest
streets — not the fastest ones.

## Language

**Ride**:
A recorded GPS trace of one cyclist trip, annotated with Conditions. A Ride
exists independently of any Route — recording never requires a destination.
_Avoid_: trip, track, recording session

**Route**:
The planned path from an origin to a destination, as returned by the routing
engine.
_Avoid_: path, directions, itinerary

**Maneuver**:
A single instruction point along a Route (e.g., "Turn left onto Beacon St"),
with its position and distance.
_Avoid_: turn, step, instruction (alone)

**Guidance**:
The live turn-by-turn delivery of a Route while riding: current Maneuver,
voice announcements, progress/ETA, off-route detection, and reroutes.
Guidance requires a Route and exists only within a Navigation Session.
_Avoid_: navigation (alone), turn-by-turn mode

**Navigation Session**:
Guidance along a Route, with Ride recording on by default (opt-out). Ends at
arrival or when the rider ends it; ending it does not by itself stop the Ride.
_Avoid_: navigation mode, nav

**Condition**:
The rider's continuous SAFE/UNSAFE judgment during a Ride. Every GPS point
inherits the Condition active at the moment it is recorded.
_Avoid_: safety flag, annotation, status

**Hazard Report**:
A discrete, rider-submitted report of a permanent infrastructure defect at a
specific location (lane gap, rough pavement, bad intersection). Distinct from
Condition: a Hazard Report is a point-in-space fact, a Condition is a
stretch-of-ride judgment.
_Avoid_: hazard flag, incident, issue

**Segment Score**:
A safety score for a stretch of street, derived from map-matched Rides,
Conditions, and Hazard Reports, used to weight routing. This is GPS4B's
defining feature and the milestone immediately after navigation ships — it
requires Rides to be map-matched onto OSM edges first. Routing is not weighted
by rider data until Segment Scores exist; stock bike routing is a placeholder,
not the destination.
_Avoid_: safety weighting (alone), route score
