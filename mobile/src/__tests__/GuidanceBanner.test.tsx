import { fireEvent, render, screen } from '@testing-library/react-native';

import { GuidanceBanner } from '../GuidanceBanner';
import { IDLE_GUIDANCE, type GuidanceState } from '../guidance';

function state(overrides: Partial<GuidanceState> = {}): GuidanceState {
  return {
    ...IDLE_GUIDANCE,
    active: true,
    currentManeuver: { instruction: 'Turn left onto Beacon St', distanceMeters: 152.4 },
    nextManeuver: { instruction: 'Turn right onto Charles St', distanceMeters: 400 },
    distanceRemainingMeters: 3218.7,
    etaSeconds: 900,
    ...overrides,
  };
}

const noop = () => {};

function renderBanner(s: GuidanceState, handlers: Partial<{
  onToggleMute: () => void;
  onEndNavigation: () => void;
}> = {}) {
  return render(
    <GuidanceBanner
      state={s}
      onToggleMute={handlers.onToggleMute ?? noop}
      onEndNavigation={handlers.onEndNavigation ?? noop}
    />
  );
}

describe('visibility', () => {
  test('renders nothing when Guidance is not active', async () => {
    await renderBanner(IDLE_GUIDANCE);
    expect(screen.queryByTestId('guidance-banner')).toBeNull();
  });

  test('renders when Guidance is active', async () => {
    await renderBanner(state());
    expect(screen.getByTestId('guidance-banner')).toBeTruthy();
  });
});

describe('instruction banner', () => {
  test('shows the current maneuver instruction', async () => {
    await renderBanner(state());
    expect(screen.getByText('Turn left onto Beacon St')).toBeTruthy();
  });

  test('shows the distance to the current maneuver in imperial units', async () => {
    await renderBanner(state());
    expect(screen.getByTestId('guidance-maneuver-distance')).toHaveTextContent('500 ft');
  });

  test('shows the next maneuver so the rider can confirm what they heard', async () => {
    await renderBanner(state());
    expect(screen.getByTestId('guidance-next-maneuver')).toHaveTextContent(
      'Then: Turn right onto Charles St'
    );
  });

  test('omits the next-maneuver line on the final maneuver', async () => {
    await renderBanner(state({ nextManeuver: null }));
    expect(screen.queryByTestId('guidance-next-maneuver')).toBeNull();
  });
});

describe('distance remaining and ETA', () => {
  test('shows both in imperial units and whole minutes', async () => {
    await renderBanner(state());
    expect(screen.getByTestId('guidance-progress')).toHaveTextContent('2.0 mi · 15 min');
  });

  test('updates as the values change', async () => {
    const { rerender } = await renderBanner(state());
    await rerender(
      <GuidanceBanner
        state={state({ distanceRemainingMeters: 152.4, etaSeconds: 60 })}
        onToggleMute={noop}
        onEndNavigation={noop}
      />
    );
    expect(screen.getByTestId('guidance-progress')).toHaveTextContent('500 ft · 1 min');
  });
});

describe('mute control', () => {
  test('offers to mute while voice is on', async () => {
    await renderBanner(state({ muted: false }));
    expect(screen.getByLabelText('Mute voice guidance')).toBeTruthy();
  });

  test('offers to unmute once muted', async () => {
    await renderBanner(state({ muted: true }));
    expect(screen.getByLabelText('Unmute voice guidance')).toBeTruthy();
  });

  test('a single tap toggles mute', async () => {
    const onToggleMute = jest.fn();
    await renderBanner(state({ muted: false }), { onToggleMute });

    await fireEvent.press(screen.getByLabelText('Mute voice guidance'));

    expect(onToggleMute).toHaveBeenCalledTimes(1);
  });
});

describe('off-route and arrival', () => {
  test('says it is rerouting while off-route', async () => {
    await renderBanner(state({ offRoute: true }));
    expect(screen.getByTestId('guidance-status')).toHaveTextContent('Rerouting…');
  });

  test('shows no status line while on-route', async () => {
    await renderBanner(state({ offRoute: false }));
    expect(screen.queryByTestId('guidance-status')).toBeNull();
  });

  test('announces arrival instead of a maneuver', async () => {
    await renderBanner(
      state({ arrived: true, currentManeuver: null, nextManeuver: null })
    );
    expect(screen.getByTestId('guidance-status')).toHaveTextContent('Arrived');
  });

  test('arrival takes precedence over an off-route flag', async () => {
    await renderBanner(state({ arrived: true, offRoute: true }));
    expect(screen.getByTestId('guidance-status')).toHaveTextContent('Arrived');
  });
});

describe('ending navigation', () => {
  test('offers an end-navigation control', async () => {
    const onEndNavigation = jest.fn();
    await renderBanner(state(), { onEndNavigation });

    await fireEvent.press(screen.getByLabelText('End navigation'));

    expect(onEndNavigation).toHaveBeenCalledTimes(1);
  });
});
