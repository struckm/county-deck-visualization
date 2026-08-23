import type {CountyFeatureCollection} from '../map/types';

const COUNTIES_URL = '/data/us-counties-2023.geojson';

export async function loadCounties(signal?: AbortSignal) {
  const response = await fetch(COUNTIES_URL, {signal});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as CountyFeatureCollection;
}
