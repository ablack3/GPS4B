import { describeFerrostarNative } from '../ferrostar-native';

describe('describeFerrostarNative', () => {
  it('reports the module as loadable when the binding exports its entrypoint', () => {
    const status = describeFerrostarNative(() => ({
      RouteAdapter: class {},
      NavigationController: class {},
    }));

    expect(status).toEqual({ available: true, exports: ['NavigationController', 'RouteAdapter'] });
  });

  // The vendored Rust binary is built per-platform (mobile/vendor/README.md).
  // A JS bundle that resolves while the .so/.xcframework is missing is the
  // failure this check exists to catch, and it must name the cause.
  it('reports why the module failed rather than throwing', () => {
    const status = describeFerrostarNative(() => {
      throw new Error("Cannot find native module 'FerrostarUniffiReactNative'");
    });

    expect(status.available).toBe(false);
    expect(status.error).toMatch(/FerrostarUniffiReactNative/);
  });

  it('treats an empty module as unavailable, not as a pass', () => {
    const status = describeFerrostarNative(() => ({}));

    expect(status.available).toBe(false);
    expect(status.error).toMatch(/no exports/i);
  });
});
