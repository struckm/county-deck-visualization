import type {CountyMetric} from '../map/types';

export type CountyMedicaid = {
  providers: number;
  paid: number;
  claimLines: number;
  serviceCells: number;
  adjustmentCells: number;
};

export type CountyMedicaidDataset = {
  id: string;
  label: string;
  description: string;
  vintage: string;
  source: {label: string; url: string};
  caveat: string;
  counties: ReadonlyMap<string, CountyMedicaid>;
};

type CountyMedicaidFile = Omit<CountyMedicaidDataset, 'counties'> & {
  counties: Record<string, CountyMedicaid>;
};

export async function loadCountyMedicaid(
  signal?: AbortSignal,
): Promise<CountyMedicaidDataset> {
  const response = await fetch('/data/county-medicaid-2024.json', {signal});
  if (!response.ok) {
    throw new Error(`Could not load county Medicaid data (${response.status})`);
  }
  const file = (await response.json()) as CountyMedicaidFile;
  return {...file, counties: new Map(Object.entries(file.counties))};
}

export function createMedicaidMetric(
  medicaid: CountyMedicaidDataset,
): CountyMetric {
  return {
    id: medicaid.id,
    label: medicaid.label,
    description: medicaid.description,
    vintage: medicaid.vintage,
    source: medicaid.source,
    scale: 'log',
    values: new Map(
      [...medicaid.counties].map(([geoid, county]) => [geoid, county.paid]),
    ),
    formatValue: formatMedicaidCurrency,
  };
}

export function formatMedicaidCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}
