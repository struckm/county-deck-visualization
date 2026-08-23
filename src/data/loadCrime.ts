import type {CountyMetric} from '../map/types';

export type CountyCrimeOffenders = {
  total: number;
  male: number;
  female: number;
  sexUnknown: number;
  hispanic: number;
  notHispanic: number;
  ethnicityMultiple: number;
  ethnicityUnknown: number;
  white: number;
  black: number;
  native: number;
  asian: number;
  pacificIslander: number;
  multiracial: number;
  raceUnknown: number;
};

export type CountyCrime = {
  offenses: number;
  incidents: number;
  offenders: CountyCrimeOffenders;
};

export type CountyCrimeDataset = {
  id: string;
  label: string;
  description: string;
  vintage: string;
  source: {label: string; url: string};
  caveat: string;
  counties: ReadonlyMap<string, CountyCrime>;
};

type CountyCrimeFile = Omit<CountyCrimeDataset, 'counties'> & {
  counties: Record<string, CountyCrime>;
};

export async function loadCountyCrime(
  signal?: AbortSignal,
): Promise<CountyCrimeDataset> {
  const response = await fetch('/data/county-crime-2025.json', {signal});
  if (!response.ok) {
    throw new Error(`Could not load county crime data (${response.status})`);
  }
  const file = (await response.json()) as CountyCrimeFile;
  return {...file, counties: new Map(Object.entries(file.counties))};
}

export function createCrimeMetric(crime: CountyCrimeDataset): CountyMetric {
  return {
    id: crime.id,
    label: crime.label,
    description: crime.description,
    vintage: crime.vintage,
    source: crime.source,
    scale: 'log',
    values: new Map(
      [...crime.counties].map(([geoid, county]) => [geoid, county.offenses]),
    ),
    formatValue: (value) => new Intl.NumberFormat('en-US').format(value),
  };
}
