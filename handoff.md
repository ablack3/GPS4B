# Handoff — 2026-08-26

Where GPS4B stands after a session on issues #2 and #3, and the open decision
that blocks #3.

## Git state

| Ref | Commit | What |
| --- | --- | --- |
| `main` | `5126260` | Merge of PR #12 — domain docs, Valhalla backend, prebuild scaffold |
| `ferrostar-vendor-fix` | `54d0237` | Pushed. Two fixes to the vendor build script |
| working tree | uncommitted | `cargo-ndk` install step in `.github/workflows/ferrostar-vendor.yml` |

Also uncommitted and unrelated: a deletion of `.claude/scheduled_tasks.lock`
and an untracked `.claude/auto/`.

## Done

**#2 self-hosted Valhalla — closed.** `valhalla/` (compose, Caddy TLS,
provisioning, tile build/deploy/smoke scripts), monthly tile-rebuild workflow,
`buildClientConfig` extracted and tested, `buildRouteRequest` split out on
mobile and web so `linear_cost_factors` is a request-field addition.

Not verified: no instance exists. Provisioning a VM and DNS is a human step —
runbook in `valhalla/README.md`. ACs 1, 4, 5 are unmet until then.

**#3 prebuild pipeline — scaffold landed, then blocked.** CNG instead of the
managed workflow, `withFerrostar` config plugin, `ferrostar-native.ts` startup
smoke check, `vendor/build-ferrostar.sh`, vendor workflow. All tests green
(mobile 75/75, server 21/21, `tsc --noEmit` clean).

## Why #3 is blocked

The plan was: compile Ferrostar's React Native binding from source once, commit
the binaries. Two workflow runs got most of the way and then hit a wall.

Runs, in order:

1. [32974531620](https://github.com/ablack3/GPS4B/actions/runs/32974531620) —
   both jobs failed in ~90s. `No matches found: "src/Native*"`. Cause: the
   script ran upstream's `ubrn:clean` on a fresh clone, and Yarn Berry's shell
   errors on a glob matching nothing. **Fixed** in `54d0237` (use
   `git clean -xfdq` instead).
2. [32974857668](https://github.com/ablack3/GPS4B/actions/runs/32974857668) —
   - Android failed: `cargo ndk ... error: no such command: ndk`. ubrn drives
     Android through `cargo-ndk`. **Fix staged, uncommitted** (see above).
   - iOS got much further: compiled Rust for all three Apple targets, `lipo`'d,
     and **successfully wrote `FerrostarRN.xcframework`**. Then bindings
     generation failed:

     ```
     extracting metadata for '_UNIFFI_META_FERROSTAR_RECORD_WAYPOINT'
     field properties of type Optional { inner_type: Bytes }
       can't have a default value of type string
     ```

**Root cause.** Ferrostar 0.54.0's Rust compiles against `uniffi` 0.31.1, but
its React Native workspace pins `uniffi-bindgen-react-native` at `^0.29.3-1`
— and caret on a `0.x` version pins the minor. uniffi changed metadata
encoding of field defaults between 0.29 and 0.31, so ubrn 0.29.3-1 cannot read
what the 0.31.1 crate emits. The offending declaration is

```rust
#[cfg_attr(feature = "uniffi", uniffi(default))]
pub properties: Option<Vec<u8>>,
```

identical in every tag back to 0.50.0, so no Ferrostar version avoids it.
Ferrostar's RN workspace does not build as shipped. Consistent with the other
evidence: those packages are unpublished on npm and the guide has no React
Native page.

Bindings generation is platform-independent, so Android would hit the same
error once `cargo-ndk` is installed.

## The open decision

Last instruction was to reconsider the vendoring approach. Research done, not
yet acted on:

**Ferrostar's released platform SDKs are prebuilt and published; only the
React Native path needs Rust.**

- iOS — SwiftPM `Package.swift` with a **binary target**:
  `libferrostar-rs.xcframework.zip`, attached to each GitHub release with a
  checksum. Confirmed present on 0.54.0. No podspec — SwiftPM only.
- Android — **Maven Central**, `com.stadiamaps.ferrostar:{core,ui-maplibre,ui-compose,google-play-services}`.
  Confirmed: `maven-metadata.xml` shows release 0.54.0.

So the promising pivot is to **write GPS4B's own thin Expo module wrapping
Ferrostar's published Swift and Kotlin SDKs**, instead of consuming their
unreleased RN binding. That would:

- remove Rust, ubrn, cargo-ndk, the NDK, and vendored binaries from the
  pipeline entirely;
- use released, versioned, documented artifacts;
- match issues #6 and #7 as actually written — they say *Kotlin binding* and
  *Swift binding*, not React Native;
- stay narrow, because the module only has to implement `src/guidance.ts`
  (start/stop, mute, a state stream), and the fake keeps covering tests.

**Unresolved risk, and the next thing to check:** Expo modules are
CocoaPods-based, and Ferrostar iOS is SwiftPM-only. A quick look at the Expo
57 `expo` package docs found no mention of SPM support. Before committing to
this pivot, confirm how an Expo 57 local module declares a SwiftPM dependency
— either first-class module support, or a config plugin that adds a remote
package reference to the generated Xcode project. `mobile/AGENTS.md` says to
read the versioned docs at https://docs.expo.dev/versions/v57.0.0/ first.

If the pivot goes ahead, most of the vendoring scaffold becomes dead code and
should be deleted: `mobile/vendor/`, `.github/workflows/ferrostar-vendor.yml`,
and the binary-presence half of `mobile/plugins/withFerrostar.js`. The New
Architecture assertion in that plugin stays useful. `ferrostar-native.ts` and
its startup log stay useful as a smoke check against whatever module replaces
it.

## Other loose ends

- `mobile/vendor/README.md` documents three `file:` dependencies that are
  deliberately **not** in `package.json` — adding them against an empty
  `vendor/ferrostar` breaks `npm ci`. Moot if the pivot happens.
- Version skew, if the RN path is ever revived: Ferrostar 0.54.0's example
  targets Expo 54 / RN 0.81 / maplibre 11.0.0-alpha.5; GPS4B is on Expo 57 /
  RN 0.86.2 / maplibre ^11.3.7.
- Merging PR #12 republished `web/` to GitHub Pages, now carrying the
  `buildRouteRequest` change.
