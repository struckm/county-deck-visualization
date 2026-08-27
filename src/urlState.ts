const METRIC_QUERY_PARAMETER = 'metric';

export function readMetricId(href: string) {
  const value = new URL(href).searchParams.get(METRIC_QUERY_PARAMETER)?.trim();
  return value || null;
}

export function createMetricUrl(href: string, metricId: string) {
  const url = new URL(href);
  url.searchParams.set(METRIC_QUERY_PARAMETER, metricId);
  return `${url.pathname}${url.search}${url.hash}`;
}
