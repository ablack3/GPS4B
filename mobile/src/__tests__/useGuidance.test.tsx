import { act, renderHook } from '@testing-library/react-native';

import { IDLE_GUIDANCE } from '../guidance';
import { createFakeGuidance } from '../guidance-fake';
import type { Route } from '../routing';
import { useGuidance } from '../useGuidance';

const route: Route = {
  points: [{ latitude: 42.36, longitude: -71.06 }],
  distanceMeters: 3000,
  durationSeconds: 900,
  maneuvers: [
    { instruction: 'Head north on Beacon St', distanceMeters: 400 },
    { instruction: 'Turn left onto Massachusetts Ave', distanceMeters: 1200 },
  ],
};

test('returns the idle state before guidance starts', async () => {
  const guidance = createFakeGuidance();
  const { result } = await renderHook(() => useGuidance(guidance));

  expect(result.current).toEqual(IDLE_GUIDANCE);
});

test('re-renders as guidance state changes', async () => {
  const guidance = createFakeGuidance();
  const { result } = await renderHook(() => useGuidance(guidance));

  await act(() => guidance.start(route));
  expect(result.current?.currentManeuver?.instruction).toBe('Head north on Beacon St');

  await act(() => guidance.advance());
  expect(result.current?.currentManeuver?.instruction).toBe(
    'Turn left onto Massachusetts Ave'
  );
});

test('picks up state that changed before the subscription was established', async () => {
  const guidance = createFakeGuidance();
  await guidance.start(route);

  const { result } = await renderHook(() => useGuidance(guidance));

  expect(result.current?.active).toBe(true);
});

test('unsubscribes on unmount so a stopped screen stops re-rendering', async () => {
  const guidance = createFakeGuidance();
  const { unmount } = await renderHook(() => useGuidance(guidance));

  await unmount();

  // The fake exposes no listener count, so assert the observable effect:
  // a post-unmount update must not warn about updating an unmounted tree.
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  await guidance.start(route);
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});
