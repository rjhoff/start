import { test, expect } from 'vitest';
import time from '../src/relative-time.js';

const { parseUtcTimestamp, formatRelativeTime } = time;
const now = Date.parse('2026-10-16T12:10:00.000Z');
const ago = (milliseconds) => new Date(now - milliseconds).toISOString();

test('invalid, missing, and timezone-free dates are rejected', () => {
  for (const value of [null, undefined, '', 'not a date', '2026-10-16T12:00', '2026-13-16T12:00Z']) {
    expect(parseUtcTimestamp(value)).toBeNull();
    expect(formatRelativeTime(value, now)).toBeNull();
  }
});

test('future timestamps and ages below one minute show now', () => {
  expect(formatRelativeTime(new Date(now + 60_000).toISOString(), now)).toBe('now');
  expect(formatRelativeTime(ago(59_999), now)).toBe('now');
});

test('minute, hour, day, and week boundaries use completed units', () => {
  for (const [age, expected] of [
    [60_000, '1m'], [59 * 60_000, '59m'], [3_600_000, '1h'],
    [23 * 3_600_000, '23h'], [86_400_000, '1d'],
    [6 * 86_400_000, '6d'], [604_800_000, '1w'], [3 * 604_800_000, '3w'],
  ]) expect(formatRelativeTime(ago(age), now)).toBe(expected);
});

test('offset timestamps represent the same instant in UTC', () => {
  expect(formatRelativeTime('2026-10-16T07:40:00-04:00', now)).toBe('30m');
});
