import type {
  AnalyticsRow,
  AnalyticsSection,
  DailyAnalyticsData,
  EmailReport,
} from '../shared/types';

interface ServiceBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface Env {
  EMAIL_SENDER: ServiceBinding;
}

const LABELS: Record<string, string> = {
  eventName: 'Event',
  eventCount: 'Events',
  totalUsers: 'Users',
  screenPageViews: 'Views',
  sessions: 'Sessions',
  pageTitle: 'Page title',
  pagePath: 'Page path',
  sessionSource: 'Source',
  sessionMedium: 'Medium',
  deviceCategory: 'Device',
  country: 'Country',
  region: 'Region',
  city: 'City',
  'customEvent:county_name': 'County',
  'customEvent:state_code': 'State',
  'customEvent:county_geoid': 'GEOID',
  'customEvent:metric_id': 'Metric',
  'customEvent:metric_label': 'Metric label',
  'customEvent:contact_method': 'Contact method',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function columnsFor(section: AnalyticsSection): string[] {
  const first = section.rows[0];
  if (!first) return [];
  return [...Object.keys(first.dimensions), ...Object.keys(first.metrics)];
}

function valueFor(row: AnalyticsRow, column: string): string {
  if (column in row.dimensions) return row.dimensions[column] || '(not set)';
  return formatNumber(row.metrics[column] ?? 0);
}

function htmlSection(section: AnalyticsSection): string {
  if (section.warning) {
    return `<section><h2>${escapeHtml(section.title)}</h2><p class="warning">${escapeHtml(section.warning)}</p></section>`;
  }
  if (section.rows.length === 0) {
    return `<section><h2>${escapeHtml(section.title)}</h2><p>No activity recorded.</p></section>`;
  }

  const columns = columnsFor(section);
  const header = columns
    .map((column) => `<th>${escapeHtml(LABELS[column] ?? column)}</th>`)
    .join('');
  const rows = section.rows
    .map(
      (row) =>
        `<tr>${columns
          .map((column) => `<td>${escapeHtml(valueFor(row, column))}</td>`)
          .join('')}</tr>`,
    )
    .join('');

  return `<section><h2>${escapeHtml(section.title)}</h2><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></section>`;
}

function textSection(section: AnalyticsSection): string {
  const lines = [`${section.title}`, '-'.repeat(section.title.length)];
  if (section.warning) return [...lines, section.warning].join('\n');
  if (section.rows.length === 0) return [...lines, 'No activity recorded.'].join('\n');

  const columns = columnsFor(section);
  lines.push(columns.map((column) => LABELS[column] ?? column).join(' | '));
  for (const row of section.rows) {
    lines.push(columns.map((column) => valueFor(row, column)).join(' | '));
  }
  return lines.join('\n');
}

export function buildDailyReport(data: DailyAnalyticsData): EmailReport {
  const subject = `County Atlas analytics — ${data.reportDate}`;
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
body{font-family:Arial,sans-serif;color:#172033;line-height:1.4;margin:0;padding:24px;background:#f4f6f8}
main{max-width:900px;margin:auto;background:#fff;padding:28px;border-radius:12px}
h1{margin:0 0 4px;font-size:24px}h2{font-size:18px;margin:28px 0 10px}
.meta{color:#687386;margin:0}.warning{padding:12px;background:#fff5d6;border-left:4px solid #e9a800}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:8px 10px;border:1px solid #dce1e7;text-align:left}
th{background:#eef2f6}tbody tr:nth-child(even){background:#f8fafc}
</style></head><body><main>
<h1>U.S. County Atlas daily analytics</h1>
<p class="meta">${escapeHtml(data.reportDate)} · GA4 property ${escapeHtml(data.propertyId)}</p>
${data.sections.map(htmlSection).join('')}
</main></body></html>`;
  const text = [
    'U.S. County Atlas daily analytics',
    `${data.reportDate} · GA4 property ${data.propertyId}`,
    '',
    ...data.sections.flatMap((section) => [textSection(section), '']),
  ].join('\n');

  return {subject, html, text};
}

function isDailyAnalyticsData(value: unknown): value is DailyAnalyticsData {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DailyAnalyticsData>;
  return (
    typeof candidate.propertyId === 'string' &&
    typeof candidate.reportDate === 'string' &&
    typeof candidate.generatedAt === 'string' &&
    Array.isArray(candidate.sections)
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/generate') {
      return new Response('Not found', {status: 404});
    }

    const data: unknown = await request.json().catch(() => null);
    if (!isDailyAnalyticsData(data)) {
      return new Response('Invalid analytics payload', {status: 400});
    }

    const report = buildDailyReport(data);
    const response = await env.EMAIL_SENDER.fetch('https://email-sender/send', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(report),
    });
    if (!response.ok) {
      return new Response(`Email sender failed: ${await response.text()}`, {status: 502});
    }

    return Response.json({sent: true, reportDate: data.reportDate});
  },
};

