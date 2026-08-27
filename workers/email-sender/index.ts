import type {EmailReport} from '../shared/types';

interface Env {
  RESEND_API_KEY: string;
  REPORT_FROM: string;
  REPORT_TO: string;
}

function isEmailReport(value: unknown): value is EmailReport {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<EmailReport>;
  return (
    typeof candidate.subject === 'string' &&
    typeof candidate.html === 'string' &&
    typeof candidate.text === 'string' &&
    candidate.subject.length > 0 &&
    candidate.html.length > 0 &&
    candidate.text.length > 0
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/send') {
      return new Response('Not found', {status: 404});
    }

    const report: unknown = await request.json().catch(() => null);
    if (!isEmailReport(report)) {
      return new Response('Invalid report payload', {status: 400});
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.REPORT_FROM,
        to: [env.REPORT_TO],
        subject: report.subject,
        html: report.html,
        text: report.text,
      }),
    });
    if (!response.ok) {
      return new Response(`Resend failed (${response.status}): ${await response.text()}`, {
        status: 502,
      });
    }

    return Response.json({sent: true});
  },
};
