/**
 * A scripted Guidance implementation.
 *
 * Exists so the guidance UI, the mute control and the Ride/Guidance
 * independence rules are testable in plain Jest — no simulator, no real GPS,
 * no native bridge. Playback is driven by explicit `advance()` calls rather
 * than timers, so a test never has to wait or fake the clock.
 *
 * It is also the implementation the app falls back to on a platform where no
 * real engine is wired up yet, which is why it produces a plausible sequence
 * from the Route rather than requiring a hand-written script.
 */
import {
  IDLE_GUIDANCE,
  type Guidance,
  type GuidanceListener,
  type GuidanceState,
} from './guidance';
import type { Route } from './routing';

/** One scripted beat: a partial state merged over the current one. */
export type GuidanceStep = Partial<Omit<GuidanceState, 'active' | 'muted'>>;

export interface FakeGuidance extends Guidance {
  /**
   * Apply the next scripted step. Returns false when guidance is inactive or
   * the script is exhausted, which lets a test drive it with `while (advance())`.
   */
  advance(): boolean;

  /** Apply an arbitrary state delta — for conditions the script doesn't cover. */
  emit(delta: GuidanceStep): void;
}

/**
 * Turns a Route into the beat-by-beat sequence a rider would experience:
 * each Maneuver becomes current in turn, with distance and ETA falling
 * proportionally, and the last beat is arrival.
 */
function scriptFromRoute(route: Route): GuidanceStep[] {
  const maneuvers = route.maneuvers;
  // A Route with no maneuvers still has to be able to arrive.
  if (maneuvers.length <= 1) return [arrivalStep()];

  const steps: GuidanceStep[] = [];
  for (let i = 1; i < maneuvers.length; i++) {
    const remainingFraction = 1 - i / maneuvers.length;
    steps.push({
      currentManeuver: maneuvers[i],
      nextManeuver: maneuvers[i + 1] ?? null,
      distanceRemainingMeters: Math.round(route.distanceMeters * remainingFraction),
      etaSeconds: Math.round(route.durationSeconds * remainingFraction),
      offRoute: false,
    });
  }
  steps.push(arrivalStep());
  return steps;
}

function arrivalStep(): GuidanceStep {
  return {
    nextManeuver: null,
    distanceRemainingMeters: 0,
    etaSeconds: 0,
    offRoute: false,
    arrived: true,
  };
}

/**
 * @param script Beats to play on `advance()`. Omit it to derive a sequence
 *   from whichever Route is passed to `start()`.
 */
export function createFakeGuidance(script?: GuidanceStep[]): FakeGuidance {
  let state: GuidanceState = { ...IDLE_GUIDANCE };
  let steps: GuidanceStep[] = [];
  let stepIndex = 0;
  const listeners = new Set<GuidanceListener>();

  function update(delta: Partial<GuidanceState>): void {
    // A fresh object every time: React compares by identity.
    state = { ...state, ...delta };
    for (const listener of listeners) listener(state);
  }

  return {
    async start(route: Route): Promise<void> {
      steps = script ?? scriptFromRoute(route);
      stepIndex = 0;
      const [first, second] = route.maneuvers;
      update({
        active: true,
        currentManeuver: first ?? null,
        nextManeuver: second ?? null,
        distanceRemainingMeters: route.distanceMeters,
        etaSeconds: route.durationSeconds,
        // A reroute lands here: adopting a new Route means back on-route.
        offRoute: false,
        arrived: false,
      });
    },

    async stop(): Promise<void> {
      steps = [];
      stepIndex = 0;
      // Mute is a session preference, not route state — it survives a stop.
      update({ ...IDLE_GUIDANCE, muted: state.muted });
    },

    setMuted(muted: boolean): void {
      if (muted === state.muted) return;
      update({ muted });
    },

    getState: () => state,

    subscribe(listener: GuidanceListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    advance(): boolean {
      if (!state.active || stepIndex >= steps.length) return false;
      update(steps[stepIndex++]);
      return true;
    },

    emit(delta: GuidanceStep): void {
      update(delta);
    },
  };
}
