/**
 * Navigation Session: Guidance along a Route, with Ride recording on by
 * default (opt-out via "Contribute this ride's data").
 *
 * The two halves are deliberately independent. Guidance never requires a Ride
 * — opting out of contributing data still navigates you, which is the fix for
 * the v0.2 bug where START NAVIGATION was silently inert with the switch off.
 * And a Ride never requires Guidance, which is why this module has no way to
 * stop one: free recording (v0.1) stays entirely `ride.ts`'s business, and
 * ending a Navigation Session leaves an active Ride running.
 *
 * Dependencies are injected so the rules above are testable without a
 * simulator, real GPS, or SQLite.
 */
import type { Guidance } from './guidance';
import type { StartRideResult } from './ride';
import type { Route } from './routing';
import type { Ride } from './types';

export interface NavigationSessionDeps {
  guidance: Guidance;
  startRide: () => Promise<StartRideResult>;
}

export type StartNavigationSessionResult =
  /** `ride` is null when the rider opted out of contributing data. */
  | { ok: true; ride: Ride | null; backgroundGranted: boolean }
  | { ok: false; reason: 'permission-denied' };

export async function startNavigationSession(
  route: Route,
  options: { recordRide: boolean },
  deps: NavigationSessionDeps
): Promise<StartNavigationSessionResult> {
  let ride: Ride | null = null;
  let backgroundGranted = false;

  if (options.recordRide) {
    // Recording first: a denied permission fails the whole session rather
    // than starting Guidance the rider would then have to back out of.
    const started = await deps.startRide();
    if (!started.ok) return started;
    ride = started.ride;
    backgroundGranted = started.backgroundGranted;
  }

  await deps.guidance.start(route);
  return { ok: true, ride, backgroundGranted };
}

/**
 * End Guidance. An active Ride keeps recording — that is the whole point of
 * the "End navigation" control, and of arrival, which ends the session
 * without stopping the Ride the rider is still on.
 */
export async function endNavigationSession(deps: NavigationSessionDeps): Promise<void> {
  await deps.guidance.stop();
}
