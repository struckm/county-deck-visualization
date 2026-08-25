import type {CountyMetric} from '../map/types';

export type CountyDemographics = {
  total: number;
  male: number;
  female: number;
  hispanic: number;
  whiteNonHispanic: number;
  blackNonHispanic: number;
  nativeNonHispanic: number;
  asianNonHispanic: number;
  pacificIslanderNonHispanic: number;
  multiracialNonHispanic: number;
  age65To69: number;
  age70To74: number;
  age75To79: number;
  age80To84: number;
  age85Plus: number;
  age65Plus: number;
};

export type CountyDemographicsDataset = {
  vintage: string;
  label: string;
  source: {
    label: string;
    url: string;
  };
  counties: ReadonlyMap<string, CountyDemographics>;
};

type CountyDemographicsFile = Omit<CountyDemographicsDataset, 'counties'> & {
  counties: Record<string, CountyDemographics>;
};

export async function loadCountyDemographics(
  signal?: AbortSignal,
): Promise<CountyDemographicsDataset> {
  const response = await fetch('/data/county-demographics-2024.json', {signal});
  if (!response.ok) {
    throw new Error(`Could not load county demographics (${response.status})`);
  }
  const file = (await response.json()) as CountyDemographicsFile;
  return {...file, counties: new Map(Object.entries(file.counties))};
}

export function createOlderPopulationMetric(
  demographics: CountyDemographicsDataset,
): CountyMetric {
  return {
    id: 'population-age-65-plus-2024',
    label: 'Population age 65+',
    description:
      'Estimated resident population age 65 and older on July 1, 2024 (Census AGEGRP 14–18)',
    vintage: demographics.vintage,
    source: demographics.source,
    scale: 'log',
    values: new Map(
      [...demographics.counties].map(([geoid, county]) => [
        geoid,
        county.age65Plus,
      ]),
    ),
    formatValue: (value) => new Intl.NumberFormat('en-US').format(value),
  };
}
