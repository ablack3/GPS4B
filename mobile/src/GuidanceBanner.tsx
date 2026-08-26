/**
 * The Guidance overlay: current Maneuver, what follows it, distance/ETA
 * remaining, and the mute and end-navigation controls.
 *
 * Purely presentational — it takes a GuidanceState and renders it, with no
 * knowledge of which engine produced that state. That is what makes it
 * testable against the fake, and what keeps Ferrostar out of the UI layer.
 *
 * Sized for gloved hands at a red light, like the hazard buttons: large
 * targets, high contrast, one tap each.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { GuidanceState } from './guidance';
import { formatDistance, formatDuration } from './units';

interface Props {
  state: GuidanceState;
  onToggleMute: () => void;
  onEndNavigation: () => void;
}

export function GuidanceBanner({ state, onToggleMute, onEndNavigation }: Props) {
  if (!state.active) return null;

  // Arrival is the more important fact when both are true — a rider at the
  // destination does not need to hear about a reroute.
  const status = state.arrived
    ? 'Arrived'
    : state.offRoute
      ? 'Rerouting…'
      : null;

  return (
    <View style={styles.banner} testID="guidance-banner">
      <View style={styles.instructionRow}>
        <View style={styles.instructionText}>
          {state.currentManeuver && (
            <>
              <Text style={styles.distance} testID="guidance-maneuver-distance">
                {formatDistance(state.currentManeuver.distanceMeters)}
              </Text>
              <Text style={styles.instruction}>{state.currentManeuver.instruction}</Text>
            </>
          )}
          {state.nextManeuver && (
            <Text style={styles.nextManeuver} testID="guidance-next-maneuver">
              Then: {state.nextManeuver.instruction}
            </Text>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={state.muted ? 'Unmute voice guidance' : 'Mute voice guidance'}
          style={styles.muteButton}
          onPress={onToggleMute}
        >
          <Text style={styles.muteButtonText}>{state.muted ? '🔇' : '🔊'}</Text>
        </Pressable>
      </View>

      {status && (
        <Text style={styles.status} testID="guidance-status">
          {status}
        </Text>
      )}

      <View style={styles.footerRow}>
        <Text style={styles.progress} testID="guidance-progress">
          {formatDistance(state.distanceRemainingMeters)} ·{' '}
          {formatDuration(state.etaSeconds)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="End navigation"
          style={styles.endButton}
          onPress={onEndNavigation}
        >
          <Text style={styles.endButtonText}>END NAV</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 56, // clears the status bar
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#1a73e8',
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  instructionText: {
    flex: 1,
  },
  distance: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  instruction: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  nextManeuver: {
    color: '#d3e3fd',
    fontSize: 14,
    marginTop: 4,
  },
  muteButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginLeft: 12,
  },
  muteButtonText: {
    fontSize: 24,
  },
  status: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  progress: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  endButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  endButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
