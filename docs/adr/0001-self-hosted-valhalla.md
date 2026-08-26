# Self-hosted Valhalla is the routing engine

Status: accepted

The public routing servers the app shipped against (`valhalla1.openstreetmap.de`,
`api.openrouteservice.org`) forbid production load, so a real launch needs a
routing backend GPS4B controls. More importantly, the entire "improve routes
with our own data" plan rests on injecting per-edge safety cost multipliers
into routing requests at request time — a Valhalla capability that no hosted
third-party API exposes, and that OpenRouteService (GraphHopper-based) cannot
offer at all. Decision: run our own Valhalla instance on a Massachusetts OSM
extract; clients repoint to it via the existing `GET /config` mechanism, no
app release required.

## Considered options

- **OpenRouteService Collaborative (nonprofit) plan** — free and hosted, but
  GraphHopper-based: no request-time per-edge cost injection, which kills the
  safety-weighting roadmap. Still a candidate for geocoding only.
- **Commercial free tiers (Stadia, Geoapify, …)** — quota'd, terms can change
  under us, no custom costing, and not "free and open" in the sense the
  project promises.

## Consequences

- GPS4B takes on hosting cost (a small VM, e.g. Hetzner CPX11 in Ashburn at
  ~$5/month for 2GB RAM — comfortable for serving Massachusetts tiles, though
  tile builds should run off-box in CI to avoid OOM on a 2GB host) and the ops
  burden of keeping a Valhalla container and its OSM extract up to date
  (Valhalla has no incremental update; full tile rebuild from a fresh
  Geofabrik extract, on a weekly/monthly cron).
- Safety-weighted routing becomes a data problem (map matching + scoring),
  not a re-platforming problem: when the data is ready, weighting is a new
  request parameter against infrastructure we already run.
- Stock bike routing ships first through the same instance, so the navigation
  milestone and the safety-weighting milestone share one backend.
