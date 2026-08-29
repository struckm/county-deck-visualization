import {describe, expect, it} from 'vitest';
import {isScheduledReportTime, previousDateInTimeZone} from './index';

describe('previousDateInTimeZone', () => {
  it('uses the previous Chicago calendar day during daylight time', () => {
    expect(
      previousDateInTimeZone(Date.parse('2026-08-27T13:00:00Z')),
    ).toBe('2026-08-26');
  });

  it('handles the first day of a month', () => {
    expect(
      previousDateInTimeZone(Date.parse('2026-09-01T13:00:00Z')),
    ).toBe('2026-08-31');
  });

  it('uses Chicago rather than the UTC calendar day', () => {
    expect(
      previousDateInTimeZone(Date.parse('2026-08-27T02:00:00Z')),
    ).toBe('2026-08-25');
  });
});

describe('isScheduledReportTime', () => {
  it('runs at 06:00 Chicago time during daylight time', () => {
    expect(isScheduledReportTime(Date.parse('2026-08-29T11:00:00Z'))).toBe(true);
    expect(isScheduledReportTime(Date.parse('2026-08-29T12:00:00Z'))).toBe(false);
  });

  it('runs at 06:00 Chicago time during standard time', () => {
    expect(isScheduledReportTime(Date.parse('2026-01-15T11:00:00Z'))).toBe(false);
    expect(isScheduledReportTime(Date.parse('2026-01-15T12:00:00Z'))).toBe(true);
  });
});
