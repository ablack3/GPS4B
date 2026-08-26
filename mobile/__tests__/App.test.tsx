/**
 * App-level wiring for the Navigation Session.
 *
 * These cover the seam between the screen and `navigation-session.ts` — the
 * layer the "START NAVIGATION does nothing with contribution off" bug
 * actually lived in. Everything below the app (SQLite, GPS, routing HTTP,
 * MapLibre) is mocked; Guidance itself is the real fake implementation.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import App from '../App';
import type { Guidance, GuidanceListener } from '../src/guidance';
import { createFakeGuidance, type FakeGuidance } from '../src/guidance-fake';
import type { Route, SearchResult } from '../src/routing';
import type { Ride } from '../src/types';

/**
 * App builds its Guidance once at module scope, so the provider hands it a
 * stable proxy that forwards to whichever fake the current test installed.
 */
let mockGuidance: FakeGuidance;

jest.mock('../src/guidance-provider', () => ({
  createGuidance: (): Guidance => ({
    start: (route: Route) => mockGuidance.start(route),
    stop: () => mockGuidance.stop(),
    setMuted: (muted: boolean) => mockGuidance.setMuted(muted),
    getState: () => mockGuidance.getState(),
    subscribe: (listener: GuidanceListener) => mockGuidance.subscribe(listener),
  }),
}));

const mockDestination: SearchResult = {
  label: 'Harvard Square',
  latitude: 42.3736,
  longitude: -71.1189,
};

const mockRoute: Route = {
  points: [
    { latitude: 42.36, longitude: -71.06 },
    { latitude: 42.3736, longitude: -71.1189 },
  ],
  distanceMeters: 3000,
  durationSeconds: 900,
  maneuvers: [
    { instruction: 'Head north on Beacon St', distanceMeters: 400 },
    { instruction: 'Turn left onto Massachusetts Ave', distanceMeters: 1200 },
  ],
};

const mockRide: Ride = {
  id: 'ride_1',
  started_at: '2026-08-26T12:00:00Z',
  ended_at: null,
  current_condition: 'SAFE',
  sync_status: 'LOCAL',
  created_at: '2026-08-26T12:00:00Z',
};

const mockStartRide = jest.fn();
const mockStopRide = jest.fn();
let mockActiveRide: Ride | null = null;

jest.mock('../src/db', () => ({
  getActiveRide: () => mockActiveRide,
  getRidesToSync: () => [],
  resetInterruptedUploads: jest.fn(),
  createHazardReport: jest.fn(),
}));

jest.mock('../src/ride', () => ({
  startRide: (...args: unknown[]) => mockStartRide(...args),
  stopRide: (...args: unknown[]) => mockStopRide(...args),
  changeCondition: jest.fn(),
}));

jest.mock('../src/sync', () => ({ syncPendingRides: async () => {} }));

jest.mock('../src/routing', () => ({
  ...jest.requireActual('../src/routing'),
  searchDestination: async () => [mockDestination],
  getBikeRoute: async () => mockRoute,
}));

jest.mock('../src/config', () => ({
  CONFIG: { mapStyleUrl: 'https://example.invalid/style.json' },
  fetchRemoteConfig: async () => {},
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
  getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
  getCurrentPositionAsync: async () => ({
    coords: { latitude: 42.36, longitude: -71.06 },
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockGuidance = createFakeGuidance();
  mockActiveRide = null;
  mockStartRide.mockResolvedValue({ ok: true, ride: mockRide, backgroundGranted: true });
  mockStopRide.mockResolvedValue(undefined);
});

/** Search for a destination and select it, leaving a Route on screen. */
async function renderWithRoute() {
  await render(<App />);

  await fireEvent.changeText(screen.getByPlaceholderText('Search destination'), 'Harvard');
  await waitFor(() => expect(screen.getByText('Harvard Square')).toBeTruthy());
  await fireEvent.press(screen.getByText('Harvard Square'));
  await waitFor(() => expect(screen.getByText('START NAVIGATION')).toBeTruthy());
}

test('the route preview shows imperial units, matching the banner', async () => {
  await renderWithRoute();
  expect(screen.getByTestId('route-summary')).toHaveTextContent('1.9 mi · 15 min by bike');
});

test('START NAVIGATION with data contribution on starts Guidance and a Ride', async () => {
  await renderWithRoute();

  await fireEvent.press(screen.getByText('START NAVIGATION'));

  await waitFor(() => expect(mockGuidance.getState().active).toBe(true));
  expect(mockStartRide).toHaveBeenCalledTimes(1);
});

test('START NAVIGATION with data contribution off still starts Guidance', async () => {
  // The v0.2 regression: this combination silently did nothing at all.
  await renderWithRoute();

  await fireEvent(
    screen.getByLabelText("Contribute this ride's data"),
    'valueChange',
    false
  );
  await fireEvent.press(screen.getByText('START NAVIGATION'));

  await waitFor(() => expect(mockGuidance.getState().active).toBe(true));
  expect(mockStartRide).not.toHaveBeenCalled();
});

test('the Guidance banner appears once a Navigation Session is running', async () => {
  await renderWithRoute();

  await fireEvent.press(screen.getByText('START NAVIGATION'));

  await waitFor(() => expect(screen.getByTestId('guidance-banner')).toBeTruthy());
  expect(screen.getByText('Head north on Beacon St')).toBeTruthy();
  expect(screen.getByTestId('guidance-progress')).toHaveTextContent('1.9 mi · 15 min');
});

test('the mute control toggles voice for the session', async () => {
  await renderWithRoute();
  await fireEvent.press(screen.getByText('START NAVIGATION'));
  await waitFor(() => expect(screen.getByTestId('guidance-banner')).toBeTruthy());

  await fireEvent.press(screen.getByLabelText('Mute voice guidance'));

  expect(mockGuidance.getState().muted).toBe(true);
  await waitFor(() => expect(screen.getByLabelText('Unmute voice guidance')).toBeTruthy());
});

test('END NAV ends Guidance without stopping the Ride', async () => {
  await renderWithRoute();
  await fireEvent.press(screen.getByText('START NAVIGATION'));
  await waitFor(() => expect(screen.getByTestId('guidance-banner')).toBeTruthy());
  mockActiveRide = mockRide;

  await fireEvent.press(screen.getByLabelText('End navigation'));

  await waitFor(() => expect(mockGuidance.getState().active).toBe(false));
  expect(mockStopRide).not.toHaveBeenCalled();
});

test('STOP RIDE ends both the Ride and Guidance', async () => {
  await renderWithRoute();
  mockActiveRide = mockRide; // startRide creates it; refreshStatus reads it back
  await fireEvent.press(screen.getByText('START NAVIGATION'));
  await waitFor(() => expect(screen.getByText('STOP RIDE')).toBeTruthy());

  await fireEvent.press(screen.getByText('STOP RIDE'));

  await waitFor(() => expect(mockStopRide).toHaveBeenCalledWith('ride_1'));
  expect(mockGuidance.getState().active).toBe(false);
});

test('START RIDE with no destination records without Guidance', async () => {
  await render(<App />);

  await fireEvent.press(screen.getByText('START RIDE'));

  await waitFor(() => expect(mockStartRide).toHaveBeenCalledTimes(1));
  expect(mockGuidance.getState().active).toBe(false);
});
