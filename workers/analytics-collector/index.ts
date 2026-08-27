import type {
  AnalyticsRow,
  AnalyticsSection,
  DailyAnalyticsData,
} from '../shared/types';

interface ServiceBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface Env {
  GA_PROPERTY_ID: string;
  GA_CLIENT_EMAIL: string;
  GA_PRIVATE_KEY: string;
  REPORT_GENERATOR: ServiceBinding;
}

interface ScheduledController {
  scheduledTime: number;
}

interface GaValue {
  value?: string;
}

interface GaReportResponse {
  dimensionHeaders?: Array<{name?: string}>;
  metricHeaders?: Array<{name?: string}>;
  rows?: Array<{
    dimensionValues?: GaValue[];
    metricValues?: GaValue[];
  }>;
  propertyQuota?: unknown;
}

interface ReportQuery {
  title: string;
  dimensions: string[];
  metrics: string[];
  eventName?: string;
  optional?: boolean;
  limit?: number;
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const REPORT_TIME_ZONE = 'America/Chicago';

const REPORT_QUERIES: ReportQuery[] = [
  {
    title: 'Events',
    dimensions: ['eventName'],
    metrics: ['eventCount', 'totalUsers'],
  },
  {
    title: 'County selections',
    dimensions: [
      'customEvent:county_name',
      'customEvent:state_code',
      'customEvent:county_geoid',
      'customEvent:metric_id',
    ],
    metrics: ['eventCount', 'totalUsers'],
    eventName: 'county_select',
    optional: true,
  },
  {
    title: 'Metric selections',
    dimensions: ['customEvent:metric_id', 'customEvent:metric_label'],
    metrics: ['eventCount', 'totalUsers'],
    eventName: 'metric_select',
    optional: true,
  },
  {
    title: 'Contact clicks',
    dimensions: ['customEvent:contact_method'],
    metrics: ['eventCount', 'totalUsers'],
    eventName: 'contact_click',
    optional: true,
  },
  {
    title: 'Pages',
    dimensions: ['pageTitle', 'pagePath'],
    metrics: ['screenPageViews', 'totalUsers'],
  },
  {
    title: 'Traffic acquisition',
    dimensions: ['sessionSource', 'sessionMedium'],
    metrics: ['sessions', 'totalUsers'],
  },
  {
    title: 'Devices',
    dimensions: ['deviceCategory'],
    metrics: ['sessions', 'totalUsers'],
  },
  {
    title: 'Locations',
    dimensions: ['country', 'region', 'city'],
    metrics: ['sessions', 'totalUsers'],
    limit: 50,
  },
];

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function encodeJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function decodePem(privateKey: string): ArrayBuffer {
  const normalized = privateKey.replace(/\\n/g, '\n');
  const body = normalized
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  const binary = atob(body);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytes.buffer;
}

async function createServiceAccountJwt(env: Env): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = encodeJson({alg: 'RS256', typ: 'JWT'});
  const claims = encodeJson({
    iss: env.GA_CLIENT_EMAIL,
    scope: ANALYTICS_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600,
  });
  const unsignedToken = `${header}.${claims}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    decodePem(env.GA_PRIVATE_KEY),
    {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'},
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsignedToken),
  );

  return `${unsignedToken}.${base64Url(new Uint8Array(signature))}`;
}

async function getAccessToken(env: Env): Promise<string> {
  const assertion = await createServiceAccountJwt(env);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google OAuth failed (${response.status}): ${await response.text()}`);
  }

  const body = (await response.json()) as {access_token?: string};
  if (!body.access_token) throw new Error('Google OAuth did not return an access token.');
  return body.access_token;
}

export function previousDateInTimeZone(
  scheduledTime: number,
  timeZone = REPORT_TIME_ZONE,
): string {
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(scheduledTime));
  const [year, month, day] = localDate.split('-').map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return previous.toISOString().slice(0, 10);
}

function parseRows(response: GaReportResponse): AnalyticsRow[] {
  const dimensions = response.dimensionHeaders?.map(({name}) => name ?? '') ?? [];
  const metrics = response.metricHeaders?.map(({name}) => name ?? '') ?? [];

  return (response.rows ?? []).map((row) => ({
    dimensions: Object.fromEntries(
      dimensions.map((name, index) => [name, row.dimensionValues?.[index]?.value ?? '']),
    ),
    metrics: Object.fromEntries(
      metrics.map((name, index) => [
        name,
        Number(row.metricValues?.[index]?.value ?? 0),
      ]),
    ),
  }));
}

async function runReport(
  env: Env,
  accessToken: string,
  date: string,
  query: ReportQuery,
): Promise<AnalyticsSection> {
  const body: Record<string, unknown> = {
    dateRanges: [{startDate: date, endDate: date}],
    dimensions: query.dimensions.map((name) => ({name})),
    metrics: query.metrics.map((name) => ({name})),
    orderBys: [
      {
        metric: {metricName: query.metrics[0]},
        desc: true,
      },
    ],
    limit: String(query.limit ?? 100),
    returnPropertyQuota: true,
  };

  if (query.eventName) {
    body.dimensionFilter = {
      filter: {
        fieldName: 'eventName',
        stringFilter: {matchType: 'EXACT', value: query.eventName},
      },
    };
  }

  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${env.GA_PROPERTY_ID}:runReport`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    if (query.optional) {
      return {
        title: query.title,
        rows: [],
        warning: `This breakdown is unavailable. Confirm its GA4 custom dimensions are registered. (${response.status})`,
      };
    }
    throw new Error(`GA4 ${query.title} report failed (${response.status}): ${detail}`);
  }

  return {
    title: query.title,
    rows: parseRows((await response.json()) as GaReportResponse),
  };
}

export async function collectAndSend(
  env: Env,
  scheduledTime = Date.now(),
): Promise<void> {
  const reportDate = previousDateInTimeZone(scheduledTime);
  const accessToken = await getAccessToken(env);
  const sections: AnalyticsSection[] = [];

  for (const query of REPORT_QUERIES) {
    sections.push(await runReport(env, accessToken, reportDate, query));
  }

  const payload: DailyAnalyticsData = {
    propertyId: env.GA_PROPERTY_ID,
    reportDate,
    generatedAt: new Date().toISOString(),
    sections,
  };

  const response = await env.REPORT_GENERATOR.fetch('https://report-generator/generate', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Report pipeline failed (${response.status}): ${await response.text()}`);
  }
}

export default {
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    await collectAndSend(env, controller.scheduledTime);
  },
};

