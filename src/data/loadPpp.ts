import type {CountyMetric} from '../map/types';

export type CountyPppOwners = {
  male: number;
  female: number;
  genderUnanswered: number;
  hispanic: number;
  notHispanic: number;
  ethnicityUnanswered: number;
  white: number;
  black: number;
  native: number;
  asian: number;
  pacificIslander: number;
  multiracial: number;
  otherRace: number;
  raceUnanswered: number;
};

export type CountyPpp = {
  loans: number;
  approved: number;
  forgiven: number;
  jobs: number;
  owners: CountyPppOwners;
};

export type CountyPppDataset = {
  id: string;
  label: string;
  description: string;
  vintage: string;
  source: {label: string; url: string};
  caveat: string;
  counties: ReadonlyMap<string, CountyPpp>;
};

type CountyPppFile = Omit<CountyPppDataset, 'counties'> & {
  counties: Record<string, CountyPpp>;
};

export async function loadCountyPpp(
  signal?: AbortSignal,
): Promise<CountyPppDataset> {
  const response = await fetch('/data/county-ppp.json', {signal});
  if (!response.ok) {
    throw new Error(`Could not load county PPP data (${response.status})`);
  }
  const file = (await response.json()) as CountyPppFile;
  return {...file, counties: new Map(Object.entries(file.counties))};
}

export function createPppMetric(ppp: CountyPppDataset): CountyMetric {
  return {
    id: ppp.id,
    label: ppp.label,
    description: ppp.description,
    vintage: ppp.vintage,
    source: ppp.source,
    scale: 'log',
    values: new Map(
      [...ppp.counties].map(([geoid, county]) => [geoid, county.approved]),
    ),
    formatValue: formatCurrency,
  };
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}
