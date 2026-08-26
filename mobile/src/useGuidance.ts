/**
 * Subscribe a React screen to a Guidance implementation.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: Guidance state
 * can change between render and subscribe (a maneuver arriving while the
 * screen mounts), and this is the hook that is defined not to miss it.
 */
import { useSyncExternalStore } from 'react';

import type { Guidance, GuidanceState } from './guidance';

export function useGuidance(guidance: Guidance): GuidanceState {
  return useSyncExternalStore(
    (onStoreChange) => guidance.subscribe(onStoreChange),
    () => guidance.getState(),
    () => guidance.getState()
  );
}
