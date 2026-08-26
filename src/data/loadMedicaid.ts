import type {CountyMetric} from '../map/types';
import type {CountyDemographicsDataset} from './loadDemographics';
import type {CountyMedicaidEnrollmentDataset} from './loadMedicaidEnrollment';

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

export function createMedicaidPerOlderResidentMetric(
  medicaid: CountyMedicaidDataset,
  demographics: CountyDemographicsDataset,
): CountyMetric {
  const values = new Map<string, number | null>();
  for (const [geoid, county] of medicaid.counties) {
    const olderPopulation = demographics.counties.get(geoid)?.age65Plus;
    values.set(
      geoid,
      olderPopulation == null || olderPopulation === 0
        ? null
        : county.paid / olderPopulation,
    );
  }
  return {
    id: `${medicaid.id}-per-resident-65-plus`,
    label: 'Medicaid paid per resident age 65+',
    description:
      'All Medicaid and CHIP provider payments attributed to county provider location, divided by the county resident population age 65+; this is a screening indicator, not spending on older beneficiaries',
    vintage: medicaid.vintage,
    source: medicaid.source,
    scale: 'quantile',
    values,
    formatValue: formatMedicaidCurrency,
  };
}

export function createMedicaidPerEnrolleeMetric(
  medicaid: CountyMedicaidDataset,
  enrollment: CountyMedicaidEnrollmentDataset,
): CountyMetric {
  const values = new Map<string, number | null>();
  for (const [geoid, county] of medicaid.counties) {
    const enrolled = enrollment.counties.get(geoid)?.enrolled;
    values.set(
      geoid,
      enrolled == null || enrolled === 0 ? null : county.paid / enrolled,
    );
  }
  return {
    id: `${medicaid.id}-per-estimated-enrollee`,
    label: 'Medicaid paid per estimated enrollee',
    description:
      '2024 Medicaid and CHIP provider payments attributed to county provider location, divided by the 2024 ACS 5-year estimate of county residents with Medicaid or other means-tested public coverage; this is an analytical estimate, not an official per-member cost',
    vintage: medicaid.vintage,
    source: medicaid.source,
    scale: 'quantile',
    values,
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
