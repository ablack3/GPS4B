#!/usr/bin/env bash
#
# Build the Ferrostar React Native packages from upstream source and vendor
# the result into mobile/vendor/ferrostar/.
#
# Why this exists: stadiamaps publishes @stadiamaps/ferrostar (web) to npm but
# NOT the three React Native packages, and upstream gitignores every generated
# artifact (cpp/, ios/, *.a, src/generated/, android/src/main/java/). There is
# nothing to `npm install` — the binding has to be compiled from Rust.
#
# Requires: rustup, yarn (corepack), Node 20+, and for
#   android — Android SDK + NDK (ANDROID_HOME / ANDROID_NDK_HOME set)
#   ios     — Xcode with command line tools selected
#
# Usage: ./build-ferrostar.sh <android|ios> [ferrostar-ref]
#
# Run once per platform; each run replaces only that platform's artifacts, so
# building android then ios leaves both vendored. CI (.github/workflows/
# ferrostar-vendor.yml) runs the two on their respective runners and opens a
# PR with the combined result.

set -euo pipefail

PLATFORM="${1:-}"
case "$PLATFORM" in
  android|ios) ;;
  *) echo "usage: build-ferrostar.sh <android|ios> [ferrostar-ref]"; exit 2 ;;
esac

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
vendor="$here/ferrostar"
REF="${2:-$(cat "$vendor/FERROSTAR_VERSION")}"
src="$here/.ferrostar-src"

echo "==> Ferrostar $REF, platform $PLATFORM"

if [ -d "$src/.git" ]; then
  git -C "$src" fetch --tags --depth 1 origin "$REF"
  git -C "$src" checkout --force FETCH_HEAD
else
  rm -rf "$src"
  git clone --depth 1 --branch "$REF" https://github.com/stadiamaps/ferrostar.git "$src"
fi

cd "$src/react-native"
corepack enable
yarn install --immutable

# Upstream's build scripts also run `expo prebuild` on their example app,
# which we neither need nor want. These are the same steps minus that.
uniffi=@stadiamaps/ferrostar-uniffi-react-native
yarn workspace "$uniffi" ubrn:clean
yarn workspace "$uniffi" "ubrn:$PLATFORM"
yarn workspace "$uniffi" prepare
yarn workspace "$uniffi" codegen
yarn workspace @stadiamaps/ferrostar-core-react-native prepare
yarn workspace @stadiamaps/ferrostar-maplibre-react-native prepare

# The pure-TypeScript packages are platform-independent; the binding is not.
copy_package() {
  local name="$1"
  rm -rf "${vendor:?}/$name"
  mkdir -p "$vendor/$name"
  # Copy the built package, minus the working files no consumer needs.
  rsync -a --delete \
    --exclude 'node_modules' --exclude '.git' --exclude 'rust_modules' \
    --exclude 'android/build' --exclude 'ios/build' --exclude '__tests__' \
    "$src/react-native/$name/" "$vendor/$name/"
}

copy_package core
copy_package maplibreui

if [ "$PLATFORM" = "android" ]; then
  # Everything the binding generates, plus the Android half. Keeps any
  # previously vendored iOS artifacts in place.
  rsync -a \
    --exclude 'node_modules' --exclude 'rust_modules' --exclude 'android/build' \
    --exclude 'ios' --exclude 'FerrostarRN.xcframework' \
    "$src/react-native/uniffi/" "$vendor/uniffi/"
else
  rsync -a \
    --exclude 'node_modules' --exclude 'rust_modules' --exclude 'ios/build' \
    "$src/react-native/uniffi/ios" "$src/react-native/uniffi/FerrostarRN.xcframework" \
    "$vendor/uniffi/"
  rsync -a \
    --exclude 'node_modules' --exclude 'rust_modules' \
    --exclude 'android' --exclude 'ios' --exclude 'FerrostarRN.xcframework' \
    "$src/react-native/uniffi/" "$vendor/uniffi/"
fi

echo "$REF" > "$vendor/FERROSTAR_VERSION"
echo "==> Vendored into $vendor"
du -sh "$vendor"/* 2>/dev/null || true
