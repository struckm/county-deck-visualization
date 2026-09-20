import {describe, expect, it, vi} from 'vitest';
import {
  handleOnDemand,
  isScheduledReportTime,
  previousDateInTimeZone,
} from './index';

const env = {
  GA_PROPERTY_ID: '327638989',
  GA_CLIENT_EMAIL: 'analytics@example.com',
  GA_PRIVATE_KEY: 'not-used-by-handler-tests',
  ON_DEMAND_TOKEN: 'test-secret',
  REPORT_GENERATOR: {fetch: vi.fn()},
};

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

describe('on-demand report endpoint', () => {
  it('requires a bearer token', async () => {
    const runReport = vi.fn();
    const response = await handleOnDemand(
      new Request('https://collector.example/generate', {method: 'POST'}),
      env,
      runReport,
    );

    expect(response.status).toBe(401);
    expect(runReport).not.toHaveBeenCalled();
  });

  it('generates yesterday by default', async () => {
    const runReport = vi.fn().mockResolvedValue('2026-08-31');
    const response = await handleOnDemand(
      new Request('https://collector.example/generate', {
        method: 'POST',
        headers: {authorization: 'Bearer test-secret'},
      }),
      env,
      runReport,
    );

    expect(response.status).toBe(200);
    expect(runReport).toHaveBeenCalledWith(env, undefined);
    await expect(response.json()).resolves.toEqual({sent: true, reportDate: '2026-08-31'});
  });

  it('accepts a specific report date', async () => {
    const runReport = vi.fn().mockResolvedValue('2026-08-20');
    const response = await handleOnDemand(
      new Request('https://collector.example/generate', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({reportDate: '2026-08-20'}),
      }),
      env,
      runReport,
    );

    expect(response.status).toBe(200);
    expect(runReport).toHaveBeenCalledWith(env, '2026-08-20');
  });

  it('rejects an invalid report date', async () => {
    const runReport = vi.fn();
    const response = await handleOnDemand(
      new Request('https://collector.example/generate', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({reportDate: '2026-02-30'}),
      }),
      env,
      runReport,
    );

    expect(response.status).toBe(400);
    expect(runReport).not.toHaveBeenCalled();
  });
});
