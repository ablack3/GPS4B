/**
 * The Guidance seam.
 *
 * Guidance is the live turn-by-turn delivery of a Route while riding: the
 * current Maneuver, voice announcements, progress/ETA, off-route detection
 * and reroutes. This module defines the ONE platform-agnostic interface the
 * rest of the app depends on. Nothing outside an implementation file may
 * reference Ferrostar, a native module, or the platform it is running on.
 *
 * Implementations (see ADR 0002):
 *   - `guidance-fake.ts`     — scripted playback, for tests and dev.
 *   - native iOS/Android     — Ferrostar Swift/Kotlin bindings (issues #6, #7).
 *   - web                    — Ferrostar web-components (issue #9).
 *
 * Guidance is deliberately independent of Ride recording: starting Guidance
 * never requires an active Ride, and recording a Ride never requires
 * Guidance. `navigation-session.ts` is what pairs them.
 */
import type { Route } from './routing';

/** A single instruction point along a Route. */
export interface Maneuver {
  /** English instruction text, e.g. "Turn left onto Beacon St". */
  instruction: string;
  /** Distance from the rider's current position to this Maneuver, in meters. */
  distanceMeters: number;
}

/**
 * Everything Guidance tells the rest of the app, as one immutable snapshot.
 *
 * Mute lives here rather than behind a separate getter so the UI has exactly
 * one thing to subscribe to — a mute tap and a maneuver change reach the
 * screen by the same path.
 */
export interface GuidanceState {
  /** True between a successful `start` and the next `stop`. */
  active: boolean;
  /** Voice announcements suppressed. Persists across reroutes. */
  muted: boolean;
  currentManeuver: Maneuver | null;
  nextManeuver: Maneuver | null;
  distanceRemainingMeters: number;
  /** Time remaining to the destination, in seconds. */
  etaSeconds: number;
  /** The rider has left the Route; a reroute is expected to follow. */
  offRoute: boolean;
  /** The rider has reached the destination. Does not stop an active Ride. */
  arrived: boolean;
}

export const IDLE_GUIDANCE: GuidanceState = Object.freeze({
  active: false,
  muted: false,
  currentManeuver: null,
  nextManeuver: null,
  distanceRemainingMeters: 0,
  etaSeconds: 0,
  offRoute: false,
  arrived: false,
});

export type GuidanceListener = (state: GuidanceState) => void;

export interface Guidance {
  /**
   * Begin Guidance along `route`. Calling this while already active adopts
   * the new Route in place — this is the reroute path, and it clears
   * `offRoute` rather than producing a second session.
   */
  start(route: Route): Promise<void>;

  /** End Guidance and return to idle. Never touches Ride recording. */
  stop(): Promise<void>;

  /** Suppress or restore voice announcements for the rest of the session. */
  setMuted(muted: boolean): void;

  getState(): GuidanceState;

  /** Returns an unsubscribe function. */
  subscribe(listener: GuidanceListener): () => void;
}
