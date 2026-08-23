import type {CountyMetric, CountyMetricFile} from '../map/types';

export async function loadCountyMetric(
  url: string,
  formatValue: CountyMetric['formatValue'],
  signal?: AbortSignal,
): Promise<CountyMetric> {
  const response = await fetch(url, {signal});
  if (!response.ok) throw new Error(`Could not load metric (${response.status})`);
  const file = (await response.json()) as CountyMetricFile;
  return {
    ...file,
    values: new Map(Object.entries(file.values)),
    formatValue,
  };
}
