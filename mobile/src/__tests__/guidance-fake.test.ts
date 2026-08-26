import { IDLE_GUIDANCE, type GuidanceState } from '../guidance';
import { createFakeGuidance } from '../guidance-fake';
import type { Route } from '../routing';

const route: Route = {
  points: [
    { latitude: 42.36, longitude: -71.06 },
    { latitude: 42.37, longitude: -71.07 },
  ],
  distanceMeters: 3000,
  durationSeconds: 900,
  maneuvers: [
    { instruction: 'Head north on Beacon St', distanceMeters: 400 },
    { instruction: 'Turn left onto Massachusetts Ave', distanceMeters: 1200 },
    { instruction: 'Arrive at your destination', distanceMeters: 0 },
  ],
};

const otherRoute: Route = {
  ...route,
  maneuvers: [{ instruction: 'Turn right onto Newbury St', distanceMeters: 250 }],
};

describe('fake Guidance lifecycle', () => {
  test('is idle before start', () => {
    const guidance = createFakeGuidance();
    expect(guidance.getState()).toEqual(IDLE_GUIDANCE);
  });

  test('start activates guidance and surfaces the route first maneuver', async () => {
    const guidance = createFakeGuidance();
    await guidance.start(route);

    const state = guidance.getState();
    expect(state.active).toBe(true);
    expect(state.arrived).toBe(false);
    expect(state.currentManeuver?.instruction).toBe('Head north on Beacon St');
    expect(state.nextManeuver?.instruction).toBe('Turn left onto Massachusetts Ave');
    expect(state.distanceRemainingMeters).toBe(3000);
    expect(state.etaSeconds).toBe(900);
  });

  test('stop returns guidance to idle', async () => {
    const guidance = createFakeGuidance();
    await guidance.start(route);
    await guidance.stop();

    expect(guidance.getState().active).toBe(false);
    expect(guidance.getState().currentManeuver).toBeNull();
  });

  test('starting again while active adopts the new route (the reroute path)', async () => {
    const guidance = createFakeGuidance();
    await guidance.start(route);
    guidance.emit({ offRoute: true });

    await guidance.start(otherRoute);

    const state = guidance.getState();
    expect(state.currentManeuver?.instruction).toBe('Turn right onto Newbury St');
    expect(state.offRoute).toBe(false);
    expect(state.active).toBe(true);
  });
});

describe('fake Guidance subscriptions', () => {
  test('notifies subscribers on every state change', async () => {
    const guidance = createFakeGuidance();
    const seen: GuidanceState[] = [];
    guidance.subscribe((s) => seen.push(s));

    await guidance.start(route);
    guidance.emit({ offRoute: true });

    expect(seen).toHaveLength(2);
    expect(seen[0].active).toBe(true);
    expect(seen[1].offRoute).toBe(true);
  });

  test('emits a fresh state object each time so React re-renders', async () => {
    const guidance = createFakeGuidance();
    const seen: GuidanceState[] = [];
    guidance.subscribe((s) => seen.push(s));

    await guidance.start(route);
    guidance.emit({ distanceRemainingMeters: 2000 });

    expect(seen[0]).not.toBe(seen[1]);
  });

  test('unsubscribing stops notifications', async () => {
    const guidance = createFakeGuidance();
    const listener = jest.fn();
    const unsubscribe = guidance.subscribe(listener);

    unsubscribe();
    await guidance.start(route);

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('fake Guidance mute', () => {
  test('starts unmuted and toggles', () => {
    const guidance = createFakeGuidance();
    expect(guidance.getState().muted).toBe(false);

    guidance.setMuted(true);
    expect(guidance.getState().muted).toBe(true);
  });

  test('notifies subscribers when mute changes', () => {
    const guidance = createFakeGuidance();
    const listener = jest.fn();
    guidance.subscribe(listener);

    guidance.setMuted(true);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].muted).toBe(true);
  });

  test('does not notify when mute is set to its current value', () => {
    const guidance = createFakeGuidance();
    const listener = jest.fn();
    guidance.subscribe(listener);

    guidance.setMuted(false);

    expect(listener).not.toHaveBeenCalled();
  });

  test('mute persists across start and stop within one session', async () => {
    const guidance = createFakeGuidance();
    guidance.setMuted(true);

    await guidance.start(route);
    expect(guidance.getState().muted).toBe(true);

    await guidance.stop();
    expect(guidance.getState().muted).toBe(true);
  });
});

describe('fake Guidance scripted playback', () => {
  test('advance walks the route maneuvers in order', async () => {
    const guidance = createFakeGuidance();
    await guidance.start(route);

    expect(guidance.advance()).toBe(true);
    expect(guidance.getState().currentManeuver?.instruction).toBe(
      'Turn left onto Massachusetts Ave'
    );
    expect(guidance.getState().nextManeuver?.instruction).toBe(
      'Arrive at your destination'
    );
  });

  test('distance remaining and ETA decrease as the script advances', async () => {
    const guidance = createFakeGuidance();
    await guidance.start(route);
    const before = guidance.getState();

    guidance.advance();
    const after = guidance.getState();

    expect(after.distanceRemainingMeters).toBeLessThan(before.distanceRemainingMeters);
    expect(after.etaSeconds).toBeLessThan(before.etaSeconds);
  });

  test('the final step arrives, with no next maneuver and nothing remaining', async () => {
    const guidance = createFakeGuidance();
    await guidance.start(route);

    while (guidance.advance()) {
      /* play the script to the end */
    }

    const state = guidance.getState();
    expect(state.arrived).toBe(true);
    expect(state.nextManeuver).toBeNull();
    expect(state.distanceRemainingMeters).toBe(0);
    expect(state.etaSeconds).toBe(0);
  });

  test('advance returns false once the script is exhausted', async () => {
    const guidance = createFakeGuidance();
    await guidance.start(route);
    while (guidance.advance()) {
      /* exhaust */
    }

    expect(guidance.advance()).toBe(false);
  });

  test('advance does nothing before guidance has started', () => {
    const guidance = createFakeGuidance();
    expect(guidance.advance()).toBe(false);
    expect(guidance.getState()).toEqual(IDLE_GUIDANCE);
  });

  test('an explicit script overrides the route-derived one', async () => {
    const guidance = createFakeGuidance([
      { offRoute: true },
      { offRoute: false, currentManeuver: { instruction: 'Rerouting', distanceMeters: 0 } },
    ]);
    await guidance.start(route);

    guidance.advance();
    expect(guidance.getState().offRoute).toBe(true);

    guidance.advance();
    expect(guidance.getState().offRoute).toBe(false);
    expect(guidance.getState().currentManeuver?.instruction).toBe('Rerouting');
  });
});
