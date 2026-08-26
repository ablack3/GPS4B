# Vendored Ferrostar React Native binding

`ferrostar/` holds the Ferrostar React Native packages, compiled from upstream
source and committed to this repo. The app depends on them by path, not from
npm.

## Why they are vendored

Stadia Maps publishes `@stadiamaps/ferrostar` (the web build) to npm but **not**
the three React Native packages — `@stadiamaps/ferrostar-{uniffi,core,maplibre}-react-native`
exist only in the [ferrostar](https://github.com/stadiamaps/ferrostar) repo's
`react-native/` yarn workspace, and upstream gitignores every generated
artifact (`cpp/`, `ios/`, `*.a`, `src/generated/`, `android/src/main/java/`).
There is nothing to install: the binding is Rust, compiled through
`uniffi-bindgen-react-native`.

That leaves three ways to consume it — build from source on every EAS run,
publish prebuilt packages to a private registry, or commit the built artifacts
here. GPS4B does the third. EAS builds stay fast and need no Rust toolchain;
the cost is binaries in git, refreshed deliberately rather than continuously.

## Layout

```
ferrostar/
  FERROSTAR_VERSION   upstream git tag this tree was built from
  uniffi/             the Rust binding — jniLibs (Android), xcframework (iOS)
  core/               FerrostarCore, route/location providers (TypeScript)
  maplibreui/         NavigationView and friends (TypeScript)
```

`.gitattributes` marks the compiled output binary: it is regenerated wholesale,
never diffed or merged.

## Refreshing it

Preferred — the **Vendor Ferrostar** workflow (Actions → Run workflow). It
builds Android on Linux and iOS on macOS, checks both artifacts landed, and
opens a PR.

Locally, one platform at a time:

```bash
./build-ferrostar.sh android          # needs rustup, yarn, Android SDK + NDK
./build-ferrostar.sh ios              # needs rustup, yarn, Xcode
./build-ferrostar.sh android 0.55.0   # and to move upstream versions
```

Each run replaces only that platform's artifacts, so running both leaves both
vendored.

## Wiring it into the app

Once `ferrostar/` is populated, add the three path dependencies to
`mobile/package.json` (the vendor workflow's PR does this):

```json
"@react-native-community/geolocation": "^3.4.0",
"@stadiamaps/ferrostar-core-react-native": "file:vendor/ferrostar/core",
"@stadiamaps/ferrostar-maplibre-react-native": "file:vendor/ferrostar/maplibreui",
"@stadiamaps/ferrostar-uniffi-react-native": "file:vendor/ferrostar/uniffi"
```

They are deliberately **not** in `package.json` while `ferrostar/` is empty:
`npm ci` would fail on unresolvable paths and take CI down with it.

`plugins/withFerrostar.js` is already registered in `app.json`. It fails
`expo prebuild` with a specific message when the platform's binary is missing,
because the TypeScript resolves and the app compiles either way — a missing
`.so` would otherwise surface as a crash on a rider's phone.

## Version compatibility

Vendored: see `ferrostar/FERROSTAR_VERSION`. Upstream's own example app at
0.54.0 targets Expo 54 / React Native 0.81 / React 19.1 /
`@maplibre/maplibre-react-native` 11.0.0-alpha.5. GPS4B is on Expo 57 / React
Native 0.86.2 / React 19.2.3 / maplibre ^11.3.7, so the combination is
untested upstream. If the binding misbehaves, that gap is the first thing to
check.
