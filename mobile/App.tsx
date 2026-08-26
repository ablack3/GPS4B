/**
 * GPS4B — map navigation, the app's main screen.
 *
 * A full-screen OSM map with a destination search bar and overlaid ride
 * controls (start/stop, SAFE/UNSAFE, hazard buttons) — Google-Maps-for-bikes
 * shape, safety-reporting substance. Navigating to a destination auto-starts
 * ride recording (visibly, with an opt-out); a destination is optional —
 * riders who already know the way can just press START RIDE.
 */
import { Camera, GeoJSONSource, Layer, Map as MapLibreMap, Marker, UserLocation } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { GuidanceBanner } from './src/GuidanceBanner';
import { CONFIG, fetchRemoteConfig } from './src/config';
import { createHazardReport, getActiveRide, getRidesToSync, resetInterruptedUploads } from './src/db';
import { logFerrostarNativeStatus } from './src/ferrostar-native';
import { createGuidance } from './src/guidance-provider';
import { endNavigationSession, startNavigationSession } from './src/navigation-session';
import { changeCondition, startRide, stopRide } from './src/ride';
import {
  getBikeRoute,
  searchDestination,
  SEARCH_DEBOUNCE_MS,
  type Route,
  type RoutePoint,
  type SearchResult,
} from './src/routing';
import { syncPendingRides } from './src/sync';
import { formatDistance, formatDuration } from './src/units';
import { useGuidance } from './src/useGuidance';
import type { Condition, HazardType, Ride } from './src/types';

const HAZARD_BUTTONS: Array<{ type: HazardType; label: string }> = [
  { type: 'LANE_GAP', label: 'Lane Gap' },
  { type: 'ROUGH_PAVEMENT', label: 'Rough Pavement' },
  { type: 'BAD_INTERSECTION', label: 'Bad Intersection' },
];

const BOSTON: RoutePoint = { latitude: 42.3601, longitude: -71.0589 };

/**
 * One Guidance instance for the app's lifetime, so a mute survives a
 * re-render and a reroute swaps the Route in place rather than starting a
 * second session. Which implementation this is, App.tsx does not know.
 */
const guidance = createGuidance();

export default function App() {
  const [ride, setRide] = useState<Ride | null>(null);
  const [condition, setCondition] = useState<Condition>('SAFE');
  const [pendingUploads, setPendingUploads] = useState(0);
  const [busy, setBusy] = useState(false);
  const [hazardFlash, setHazardFlash] = useState<string | null>(null);

  const [userLocation, setUserLocation] = useState<RoutePoint>(BOSTON);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [destination, setDestination] = useState<SearchResult | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [recordThisRide, setRecordThisRide] = useState(true);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const guidanceState = useGuidance(guidance);
  const sessionDeps = useMemo(() => ({ guidance, startRide }), []);

  const refreshStatus = useCallback(() => {
    setRide(getActiveRide());
    setPendingUploads(getRidesToSync().length);
  }, []);

  useEffect(() => {
    resetInterruptedUploads();
    fetchRemoteConfig().finally(refreshStatus);
    syncPendingRides().finally(refreshStatus);
    // Build-pipeline smoke check: says in the log whether the vendored
    // Ferrostar binary made it into this build. Nothing depends on it yet.
    logFerrostarNativeStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshStatus();
        syncPendingRides().finally(refreshStatus);
      }
    });
    return () => sub.remove();
  }, [refreshStatus]);

  useEffect(() => {
    if (ride) setCondition(ride.current_condition);
  }, [ride]);

  // Best-effort initial position for map center, search bias, and routing —
  // recording itself uses the background task's own accurate stream.
  useEffect(() => {
    (async () => {
      const perms = await Location.requestForegroundPermissionsAsync();
      if (perms.status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({});
      setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    })();
  }, []);

  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    searchDebounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await searchDestination(query, userLocation));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [query, userLocation]);

  const onSelectDestination = async (result: SearchResult) => {
    setDestination(result);
    setResults([]);
    setQuery(result.label);
    try {
      setRoute(await getBikeRoute(userLocation, result));
    } catch (e) {
      setRoute(null);
      console.warn('Routing failed', e);
    }
  };

  /**
   * Start a Navigation Session. Guidance runs whether or not the rider
   * contributes data — with the switch off this used to return early and do
   * nothing at all, which read as a dead button.
   */
  const onStartNavigation = async () => {
    if (!route) return;
    setBusy(true);
    try {
      const result = await startNavigationSession(
        route,
        { recordRide: recordThisRide },
        sessionDeps
      );
      if (!result.ok) {
        console.warn('Location permission required to navigate.');
        return;
      }
      refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  const onToggleMute = () => guidance.setMuted(!guidanceState.muted);

  /** Ends Guidance only — an active Ride keeps recording. */
  const onEndNavigation = async () => {
    await endNavigationSession(sessionDeps);
  };

  const onClearDestination = () => {
    setDestination(null);
    setRoute(null);
    setQuery('');
  };

  const onStartRide = async () => {
    setBusy(true);
    try {
      const result = await startRide();
      if (!result.ok) {
        console.warn('Location permission required to record a ride.');
        return;
      }
      refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  const onStopRide = async () => {
    if (!ride) return;
    setBusy(true);
    try {
      // The rider is done: end Guidance too. (The converse does not hold —
      // ending Guidance leaves the Ride recording.)
      await endNavigationSession(sessionDeps);
      await stopRide(ride.id);
      onClearDestination();
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

  const onHazard = async (type: HazardType) => {
    const perms = await Location.getForegroundPermissionsAsync();
    let point = userLocation;
    if (perms.status === 'granted') {
      const pos = await Location.getCurrentPositionAsync({});
      point = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    }
    createHazardReport(ride?.id ?? null, type, point.latitude, point.longitude);
    syncPendingRides().catch(() => {});
    setHazardFlash(type);
    setTimeout(() => setHazardFlash(null), 1500);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <MapLibreMap style={styles.map} mapStyle={CONFIG.mapStyleUrl}>
        <Camera
          initialViewState={{ center: [userLocation.longitude, userLocation.latitude], zoom: 14 }}
          center={route ? undefined : [userLocation.longitude, userLocation.latitude]}
          trackUserLocation={route ? undefined : 'default'}
        />
        <UserLocation />
        {destination && (
          <Marker id="destination" lngLat={[destination.longitude, destination.latitude]}>
            <View style={styles.destinationPin} />
          </Marker>
        )}
        {route && (
          <GeoJSONSource
            id="route"
            data={{
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: route.points.map((p) => [p.longitude, p.latitude]),
              },
            }}
          >
            <Layer
              id="routeLine"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#1a73e8', 'line-width': 5 }}
            />
          </GeoJSONSource>
        )}
      </MapLibreMap>

      <GuidanceBanner
        state={guidanceState}
        onToggleMute={onToggleMute}
        onEndNavigation={onEndNavigation}
      />

      {/* The rider is following a Route, not searching — reclaim the top. */}
      {!guidanceState.active && (
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search destination"
            placeholderTextColor="#888"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
          {searching && <ActivityIndicator style={styles.searchSpinner} />}
          {destination && (
            <Pressable accessibilityRole="button" onPress={onClearDestination} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>×</Text>
            </Pressable>
          )}
        </View>
      )}

      {results.length > 0 && !guidanceState.active && (
        <View style={styles.resultsList}>
          {results.map((r) => (
            <Pressable
              key={`${r.latitude},${r.longitude}`}
              accessibilityRole="button"
              style={styles.resultRow}
              onPress={() => onSelectDestination(r)}
            >
              <Text style={styles.resultText}>{r.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {route && !ride && !guidanceState.active && (
        <View style={styles.routeSummary}>
          <Text style={styles.routeSummaryText} testID="route-summary">
            {formatDistance(route.distanceMeters)} ·{' '}
            {formatDuration(route.durationSeconds)} by bike
          </Text>
          <View style={styles.recordRow}>
            <Text style={styles.recordRowText}>Contribute this ride's data</Text>
            <Switch
              accessibilityLabel="Contribute this ride's data"
              value={recordThisRide}
              onValueChange={setRecordThisRide}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            style={[styles.bigButton, styles.startButton]}
            onPress={onStartNavigation}
            disabled={busy}
          >
            <Text style={styles.bigButtonText}>START NAVIGATION</Text>
          </Pressable>
        </View>
      )}

      {hazardFlash && (
        <View style={styles.hazardFlash}>
          <Text style={styles.hazardFlashText}>Reported: {hazardFlash.replace('_', ' ')}</Text>
        </View>
      )}

      <View style={styles.bottomOverlay}>
        {ride ? (
          <>
            <View style={styles.recordingRow}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>Recording</Text>
            </View>
            <View style={styles.hazardRow}>
              {HAZARD_BUTTONS.map((h) => (
                <Pressable
                  key={h.type}
                  accessibilityRole="button"
                  style={styles.hazardButton}
                  onPress={() => onHazard(h.type)}
                >
                  <Text style={styles.hazardButtonText}>{h.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.conditionRow}>
              <Pressable
                accessibilityRole="button"
                style={[styles.conditionButton, condition === 'SAFE' && styles.conditionSafeActive]}
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
                style={[styles.conditionButton, condition === 'UNSAFE' && styles.conditionUnsafeActive]}
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
          </>
        ) : (
          !route && (
            <>
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
            </>
          )
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  map: { flex: 1 },
  searchBar: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 52,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  searchInput: { flex: 1, fontSize: 17, color: '#1a1a1a' },
  searchSpinner: { marginLeft: 8 },
  clearButton: { paddingHorizontal: 8, paddingVertical: 4 },
  clearButtonText: { fontSize: 22, color: '#888' },
  resultsList: {
    position: 'absolute',
    top: 112,
    left: 16,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  resultRow: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#eee' },
  resultText: { fontSize: 15, color: '#1a1a1a' },
  routeSummary: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  routeSummaryText: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', marginBottom: 12 },
  recordRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  recordRowText: { fontSize: 14, color: '#444' },
  hazardFlash: {
    position: 'absolute',
    top: 120,
    alignSelf: 'center',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  hazardFlashText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.97)',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 12,
  },
  recordingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center' },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#d32f2f' },
  recordingText: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  hazardRow: { flexDirection: 'row', gap: 8 },
  hazardButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#fff3e0',
    borderWidth: 2,
    borderColor: '#f57c00',
    alignItems: 'center',
  },
  hazardButtonText: { fontSize: 13, fontWeight: '700', color: '#e65100', textAlign: 'center' },
  conditionRow: { flexDirection: 'row', gap: 12 },
  conditionButton: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#bbb',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  conditionSafeActive: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  conditionUnsafeActive: { backgroundColor: '#c62828', borderColor: '#c62828' },
  conditionButtonText: { fontSize: 18, fontWeight: '700', color: '#444' },
  conditionButtonTextActive: { color: '#fff' },
  bigButton: { paddingVertical: 20, borderRadius: 16, alignItems: 'center' },
  startButton: { backgroundColor: '#2e7d32' },
  stopButton: { backgroundColor: '#c62828' },
  bigButtonText: { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  syncStatus: { fontSize: 13, color: '#777', textAlign: 'center' },
  destinationPin: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#d32f2f', borderWidth: 2, borderColor: '#fff' },
});
