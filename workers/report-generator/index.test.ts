import {describe, expect, it, vi} from 'vitest';
import type {DailyAnalyticsData} from '../shared/types';
import reportWorker, {buildDailyReport} from './index';

const analytics: DailyAnalyticsData = {
  propertyId: '327638989',
  reportDate: '2026-08-26',
  generatedAt: '2026-08-27T13:00:00.000Z',
  sections: [
    {
      title: 'Events',
      rows: [
        {
          dimensions: {eventName: 'county_select'},
          metrics: {eventCount: 12, totalUsers: 3},
        },
      ],
    },
    {
      title: 'Contact clicks',
      rows: [],
      warning: 'Custom dimension is not registered.',
    },
  ],
};

describe('buildDailyReport', () => {
  it('creates readable HTML and text reports', () => {
    const report = buildDailyReport(analytics);

    expect(report.subject).toBe('County Atlas analytics — 2026-08-26');
    expect(report.html).toContain('county_select');
    expect(report.html).toContain('12');
    expect(report.text).toContain('Custom dimension is not registered.');
  });
});

describe('report generator Worker', () => {
  it('passes the generated report to the email sender', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({sent: true}));
    const response = await reportWorker.fetch(
      new Request('https://report-generator/generate', {
        method: 'POST',
        body: JSON.stringify(analytics),
      }),
      {EMAIL_SENDER: {fetch}},
    );

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
    const request = fetch.mock.calls[0][1] as RequestInit;
    expect(String(request.body)).toContain('County Atlas analytics');
  });
});

