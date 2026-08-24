/**
 * GPS4B — the recording screen (the whole v0.1 UI).
 *
 * Controls are deliberately large: the app is operated briefly while the
 * rider is stopped, often with gloves.
 */
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AppState,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { CONFIG } from './src/config';
import {
  countRidePoints,
  getActiveRide,
  getRidesToSync,
  resetInterruptedUploads,
} from './src/db';
import { changeCondition, startRide, stopRide } from './src/ride';
import { syncPendingRides } from './src/sync';
import type { Condition, Ride } from './src/types';

export default function App() {
  const [ride, setRide] = useState<Ride | null>(null);
  const [condition, setCondition] = useState<Condition>('SAFE');
  const [pointCount, setPointCount] = useState(0);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(() => {
    const active = getActiveRide();
    setRide(active);
    if (active) {
      setCondition(active.current_condition);
      setPointCount(countRidePoints(active.id));
    }
    setPendingUploads(getRidesToSync().length);
  }, []);

  // Startup: recover state after the app was killed or restarted mid-ride,
  // re-queue interrupted uploads, and attempt a sync.
  useEffect(() => {
    resetInterruptedUploads();
    refreshStatus();
    syncPendingRides().finally(refreshStatus);
  }, [refreshStatus]);

  // Sync whenever the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshStatus();
        syncPendingRides().finally(refreshStatus);
      }
    });
    return () => sub.remove();
  }, [refreshStatus]);

  // Periodic refresh of the point counter and periodic sync attempts.
  useEffect(() => {
    const uiTimer = setInterval(refreshStatus, CONFIG.uiRefreshMs);
    const syncTimer = setInterval(
      () => syncPendingRides().finally(refreshStatus),
      CONFIG.syncIntervalMs
    );
    return () => {
      clearInterval(uiTimer);
      clearInterval(syncTimer);
    };
  }, [refreshStatus]);

  const onStartRide = async () => {
    setBusy(true);
    try {
      const result = await startRide();
      if (!result.ok) {
        Alert.alert(
          'Location permission required',
          'GPS4B records your location while you are recording a bicycle ' +
            'ride so your route can contribute to the bicycle map. ' +
            'Please allow location access to record a ride.'
        );
        return;
      }
      if (!result.backgroundGranted) {
        Alert.alert(
          'Background location not allowed',
          'Recording will work while GPS4B is open, but may stop when the ' +
            'phone is locked. Allow location access "all the time" for ' +
            'reliable recording.'
        );
      }
      refreshStatus();
    } catch (e) {
      Alert.alert('Could not start ride', String(e));
    } finally {
      setBusy(false);
    }
  };

  const onStopRide = async () => {
    if (!ride) return;
    setBusy(true);
    try {
      await stopRide(ride.id);
      refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  const onCondition = (next: Condition) => {
    if (!ride) return;
    changeCondition(ride.id, next);
    setCondition(next);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>GPS4B</Text>

      {ride ? (
        <View style={styles.body}>
          <View style={styles.recordingRow}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>Ride: Recording</Text>
          </View>
          <Text style={styles.pointCount}>
            {pointCount} GPS point{pointCount === 1 ? '' : 's'} recorded
          </Text>

          <Text style={styles.sectionLabel}>Current condition</Text>
          <View style={styles.conditionRow}>
            <Pressable
              accessibilityRole="button"
              style={[
                styles.conditionButton,
                condition === 'SAFE' && styles.conditionSafeActive,
              ]}
              onPress={() => onCondition('SAFE')}
            >
              <Text
                style={[
                  styles.conditionButtonText,
                  condition === 'SAFE' && styles.conditionButtonTextActive,
                ]}
              >
                SAFE
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[
                styles.conditionButton,
                condition === 'UNSAFE' && styles.conditionUnsafeActive,
              ]}
              onPress={() => onCondition('UNSAFE')}
            >
              <Text
                style={[
                  styles.conditionButtonText,
                  condition === 'UNSAFE' && styles.conditionButtonTextActive,
                ]}
              >
                UNSAFE
              </Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            style={[styles.bigButton, styles.stopButton]}
            onPress={onStopRide}
            disabled={busy}
          >
            <Text style={styles.bigButtonText}>STOP RIDE</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.body}>
          <Pressable
            accessibilityRole="button"
            style={[styles.bigButton, styles.startButton]}
            onPress={onStartRide}
            disabled={busy}
          >
            <Text style={styles.bigButtonText}>START RIDE</Text>
          </Pressable>
          <Text style={styles.syncStatus}>
            {pendingUploads > 0
              ? `${pendingUploads} ride${pendingUploads === 1 ? '' : 's'} waiting to upload`
              : 'All rides uploaded'}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: 48,
    color: '#1a1a1a',
  },
  body: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recordingDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#d32f2f',
  },
  recordingText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  pointCount: {
    fontSize: 16,
    color: '#555',
  },
  sectionLabel: {
    fontSize: 18,
    color: '#333',
    marginTop: 24,
  },
  conditionRow: {
    flexDirection: 'row',
    gap: 16,
    alignSelf: 'stretch',
  },
  conditionButton: {
    flex: 1,
    paddingVertical: 28,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#bbb',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  conditionSafeActive: {
    backgroundColor: '#2e7d32',
    borderColor: '#2e7d32',
  },
  conditionUnsafeActive: {
    backgroundColor: '#c62828',
    borderColor: '#c62828',
  },
  conditionButtonText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#444',
  },
  conditionButtonTextActive: {
    color: '#fff',
  },
  bigButton: {
    alignSelf: 'stretch',
    paddingVertical: 32,
    borderRadius: 20,
    alignItems: 'center',
    marginTop: 32,
  },
  startButton: {
    backgroundColor: '#2e7d32',
  },
  stopButton: {
    backgroundColor: '#c62828',
  },
  bigButtonText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
  },
  syncStatus: {
    fontSize: 14,
    color: '#777',
  },
});
