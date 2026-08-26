import { formatDistance, formatDuration } from '../units';

describe('formatDistance (imperial)', () => {
  test('shows short distances in feet, rounded to the nearest 10', () => {
    expect(formatDistance(0)).toBe('0 ft');
    expect(formatDistance(30.48)).toBe('100 ft');
    expect(formatDistance(47)).toBe('150 ft');
  });

  test('rounds sub-10-foot distances up to 10 ft rather than showing 0', () => {
    expect(formatDistance(1)).toBe('10 ft');
  });

  test('switches to miles at 1000 ft', () => {
    expect(formatDistance(303)).toBe('990 ft');
    expect(formatDistance(304.8)).toBe('0.2 mi');
  });

  test('shows miles to one decimal place', () => {
    expect(formatDistance(1609.344)).toBe('1.0 mi');
    expect(formatDistance(4828.03)).toBe('3.0 mi');
  });

  test('drops the decimal at 10 miles and above to keep the banner narrow', () => {
    expect(formatDistance(16093.44)).toBe('10 mi'); // exactly 10 mi
    expect(formatDistance(25749.5)).toBe('16 mi');
  });

  test('treats negative or non-finite input as zero rather than rendering NaN', () => {
    expect(formatDistance(-5)).toBe('0 ft');
    expect(formatDistance(NaN)).toBe('0 ft');
    expect(formatDistance(Infinity)).toBe('0 ft');
  });
});

describe('formatDuration', () => {
  test('shows under a minute as "<1 min"', () => {
    expect(formatDuration(0)).toBe('<1 min');
    expect(formatDuration(59)).toBe('<1 min');
  });

  test('shows whole minutes under an hour', () => {
    expect(formatDuration(60)).toBe('1 min');
    expect(formatDuration(1500)).toBe('25 min');
  });

  test('shows hours and minutes past an hour', () => {
    expect(formatDuration(3600)).toBe('1 hr');
    expect(formatDuration(3900)).toBe('1 hr 5 min');
    expect(formatDuration(9000)).toBe('2 hr 30 min');
  });

  test('treats negative or non-finite input as zero rather than rendering NaN', () => {
    expect(formatDuration(-5)).toBe('<1 min');
    expect(formatDuration(NaN)).toBe('<1 min');
  });
});
