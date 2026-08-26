/**
 * Chooses the Guidance implementation for the platform the app is running on.
 *
 * This is the only module that knows which engine is in use; everything else
 * depends on the `Guidance` interface alone. When the Ferrostar bindings land
 * (issues #6 iOS, #7 Android, #9 web) they are selected here — no consumer
 * changes.
 *
 * Until then the scripted fake stands in, so the guidance UI, the mute
 * control and the Ride/Guidance independence rules are already exercised
 * end-to-end by the app they ship in.
 */
import type { Guidance } from './guidance';
import { createFakeGuidance } from './guidance-fake';

export function createGuidance(): Guidance {
  return createFakeGuidance();
}
