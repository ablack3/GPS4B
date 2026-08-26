# Ferrostar's native (Swift/Kotlin) bindings provide Guidance

Status: accepted

Turn-by-turn Guidance (snap-to-route, off-route detection, step advancement,
rerouting, voice) needs either an existing maintained engine or building one
from scratch. [Ferrostar](https://github.com/stadiamaps/ferrostar) (BSD-3,
Stadia Maps) is the only free, cross-platform, actively-maintained candidate,
and it consumes routes from a self-hosted Valhalla natively — but its React
Native bindings are pre-alpha, unpublished to npm, untested against our Expo
57 / RN 0.86 stack, and carry none of Ferrostar's voice/audio-session code
(that exists only in the Swift and Kotlin cores). Decision: adopt Ferrostar's
**native iOS (Swift) and Android (Kotlin) bindings** directly — both are
labeled production-ready — and bridge them into the existing React Native UI
with a thin native module per platform, rather than depending on Ferrostar's
RN packages or building a guidance engine ourselves.

## Considered options

- **Ferrostar's React Native bindings as-is** — stays pure Expo/JS, but
  inherits an unpublished, pre-alpha dependency, and still requires building
  the voice/locked-screen-audio layer ourselves since Ferrostar's RN tree has
  none of it. Captures little of "an existing library does this for us."
- **Build a guidance layer from scratch** on Valhalla's own maneuver/verbal
  fields — zero foreign dependency, cheapest to keep matched to our exact RN
  version, but the most engineering time, including reimplementing
  snap-to-route and off-route detection.

## Architecture

- **Expo prebuild (CNG), not a bare-workflow eject.** Native `ios/`/`android/`
  folders are generated from a Ferrostar config plugin, consistent with how
  background location is already configured — native setup stays
  config-driven and regeneratable rather than a permanently diverging fork.
- **Headless.** Ferrostar's bundled SwiftUI/Compose navigation screens are not
  used. Its `NavigationController` state (current maneuver, distance
  remaining, off-route status) is bridged up into React Native, and Guidance
  UI (banner, ETA, mute button) is rendered once in the existing MapLibre-based
  map component shared across platforms — not three divergent native screens.
- **Web runs Ferrostar's web-components build too**, screen-on only (browsers
  cannot do background geolocation or locked-screen voice — an inherent
  platform limit, documented for users, not a defect). This keeps one shared
  concept of Guidance instead of a second, divergent web implementation.

## Consequences

- Mobile is no longer pure Expo-managed JS: a Swift module and a Kotlin
  module, each wrapping Ferrostar's Rust core, must be built and maintained
  alongside the existing React Native code. This is a real architecture
  change, paid once.
- GPS recording, SQLite storage, and sync (`mobile/src/ride.ts`, `location.ts`,
  `db.ts`, `sync.ts`) are untouched — Ferrostar only replaces route-fetching
  and turn-by-turn display, not the recording pipeline.
- Safety-weighted routing (the `linear_cost_factors` roadmap) passes through
  unchanged: Ferrostar's Valhalla adapter accepts arbitrary costing-options
  passthrough, so weighting is still "a new request parameter," not a
  navigation-engine change.
- Web navigation is a separate concern: Ferrostar's web-components build is
  "rougher beta" with no background geolocation and no locked-screen voice —
  its fit for the web PWA is still open.
- Locked-screen voice on iOS is not guaranteed by adopting Ferrostar — it
  requires its own audio-session spike (see acceptance criteria) regardless
  of which engine delivers the maneuver stream.
- The EAS build pipeline needs a Rust toolchain added (Ferrostar's native
  bindings compile from its Rust core via UniFFI) — a real CI cost, accepted
  as part of choosing native bindings over the unpublished RN packages.
