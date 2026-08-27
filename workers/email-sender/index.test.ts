import {afterEach, describe, expect, it, vi} from 'vitest';
import emailWorker from './index';

describe('email sender Worker', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends only a valid generated report to the configured addresses', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({id: 'example'}));
    vi.stubGlobal('fetch', fetch);
    const response = await emailWorker.fetch(
      new Request('https://email-sender/send', {
        method: 'POST',
        body: JSON.stringify({
          subject: 'Daily report',
          html: '<h1>Daily report</h1>',
          text: 'Daily report',
        }),
      }),
      {
        RESEND_API_KEY: 'test-key',
        REPORT_FROM: 'analytics@markstruck.com',
        REPORT_TO: 'markstruck@comcast.net',
      },
    );

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
    const request = fetch.mock.calls[0][1] as RequestInit;
    expect(String(request.body)).toContain('analytics@markstruck.com');
    expect(String(request.body)).toContain('markstruck@comcast.net');
  });

  it('rejects malformed report content', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const response = await emailWorker.fetch(
      new Request('https://email-sender/send', {
        method: 'POST',
        body: JSON.stringify({subject: 'Incomplete'}),
      }),
      {
        RESEND_API_KEY: 'test-key',
        REPORT_FROM: 'analytics@markstruck.com',
        REPORT_TO: 'markstruck@comcast.net',
      },
    );

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
