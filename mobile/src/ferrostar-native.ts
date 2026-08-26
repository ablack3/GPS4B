/**
 * Smoke check for the vendored Ferrostar native binding.
 *
 * This is scaffolding, not Guidance: it answers one question — did the Rust
 * binary vendored under mobile/vendor/ferrostar actually make it into this
 * build and load? A JS bundle resolves the binding's TypeScript happily even
 * when the .so or .xcframework is absent, so "it compiles" proves nothing;
 * only loading it on a device does.
 *
 * Real turn-by-turn is issues #6 (Android) and #7 (iOS), behind the Guidance
 * interface in src/guidance.ts.
 */

export interface FerrostarNativeStatus {
  available: boolean;
  /** Sorted export names, when the module loaded. */
  exports?: string[];
  /** Why it did not load, when it did not. */
  error?: string;
}

type ModuleLoader = () => Record<string, unknown>;

const loadBinding: ModuleLoader = () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@stadiamaps/ferrostar-uniffi-react-native');

/**
 * `load` is injected so this is testable off-device; production callers use
 * the default, which requires the vendored package.
 */
export function describeFerrostarNative(load: ModuleLoader = loadBinding): FerrostarNativeStatus {
  let module: Record<string, unknown>;
  try {
    module = load();
  } catch (err) {
    return { available: false, error: err instanceof Error ? err.message : String(err) };
  }

  const exports = Object.keys(module ?? {}).sort();
  if (exports.length === 0) {
    return { available: false, error: 'Binding resolved but has no exports' };
  }
  return { available: true, exports };
}

let alreadyLogged = false;

/**
 * Called at startup. The line it prints is the acceptance check for the build
 * pipeline: install a real iOS or Android build, watch the log, and confirm
 * the binding loaded. Logs once per process — whether the binary is in the
 * build cannot change while the app is running.
 */
export function logFerrostarNativeStatus(): void {
  if (alreadyLogged) return;
  alreadyLogged = true;
  const status = describeFerrostarNative();
  if (status.available) {
    console.log(`Ferrostar native binding loaded (${status.exports?.length} exports)`);
  } else {
    console.warn(`Ferrostar native binding UNAVAILABLE: ${status.error}`);
  }
}
