import type {CountyMetric} from '../map/types';

export type CountyH1bRankedItem = {
  name?: string;
  socCode?: string;
  title?: string;
  workerPlacements: number;
};

export type CountyH1b = {
  name: string;
  applications: number;
  certifiedApplications: number;
  allWorkerPlacements: number;
  certifiedWorkerPlacements: number;
  fullTimeWorkerPlacements: number;
  secondaryEntityWorkerPlacements: number;
  averageOfferedAnnualWage: number | null;
  averagePrevailingAnnualWage: number | null;
  averageWagePremiumPercent: number | null;
  topEmployers: CountyH1bRankedItem[];
  topOccupations: CountyH1bRankedItem[];
};

export type CountyH1bDataset = {
  id: string;
  label: string;
  description: string;
  vintage: string;
  period: string;
  source: {label: string; url: string};
  caveat: string;
  counties: ReadonlyMap<string, CountyH1b>;
};

type CountyH1bFile = Omit<CountyH1bDataset, 'counties'> & {
  counties: Record<string, CountyH1b>;
};

export async function loadCountyH1b(
  signal?: AbortSignal,
): Promise<CountyH1bDataset> {
  const response = await fetch('/data/county-h1b-fy2025.json', {signal});
  if (!response.ok) {
    throw new Error(`Could not load county H-1B data (${response.status})`);
  }
  const file = (await response.json()) as CountyH1bFile;
  return {...file, counties: new Map(Object.entries(file.counties))};
}

export function createH1bMetric(h1b: CountyH1bDataset): CountyMetric {
  return {
    id: h1b.id,
    label: h1b.label,
    description: h1b.description,
    vintage: h1b.vintage,
    source: h1b.source,
    scale: 'log',
    values: new Map(
      [...h1b.counties].map(([geoid, county]) => [
        geoid,
        county.certifiedWorkerPlacements,
      ]),
    ),
    formatValue: formatH1bCount,
  };
}

export function formatH1bCount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatH1bCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}
