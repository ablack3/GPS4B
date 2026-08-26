# Roadmap

## Next: Real navigation (Guidance)

Turn-by-turn Guidance via Ferrostar's native iOS/Android bindings, self-hosted
Valhalla, voice, off-route rerouting. See [ADR 0001](adr/0001-self-hosted-valhalla.md)
and [ADR 0002](adr/0002-ferrostar-native-navigation.md). No routing behavior
change — stock bike routing, not yet weighted by rider data.

## Then: Segment Score — GPS4B's defining feature

Weight routing by rider-contributed safety data (Rides, Conditions, Hazard
Reports), not just distance/time. This is why GPS4B exists; everything before
it is groundwork.

Known prerequisites, not yet started:

- **Map matching** — snap recorded Ride GPS traces onto OSM edges. Without
  this, rider data can't be attributed to specific street segments.
- **Segment scoring model** — turn matched Rides + Conditions + Hazard
  Reports into a per-edge safety score. Needs enough data per segment to be
  more signal than noise (see the stability/generalizability discipline for
  validating this before trusting it in production routes).
- **Routing integration** — feed scores into Valhalla via `linear_cost_factors`
  (confirmed available, request-time per-edge cost multipliers; see ADR 0001).
  This step is small once the two above exist — "a new request parameter,"
  not a re-platforming.

Deliberately not started before navigation ships: weighting routes on too
little data risks routes that are different, not verifiably safer, which
undermines trust in the app's core safety claim.
