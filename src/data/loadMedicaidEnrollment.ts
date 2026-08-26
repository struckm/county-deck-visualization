import type {CountyMetric} from '../map/types';

export type CountyMedicaidEnrollment = {
  name: string;
  stateAbbreviation: string;
  stateFips: string;
  countyFips: string;
  population: number;
  populationMoe: number;
  enrolled: number;
  enrolledMoe: number;
  enrollmentPercent: number | null;
  under19: number;
  under19Moe: number;
  age19To64: number;
  age19To64Moe: number;
  age65Plus: number;
  age65PlusMoe: number;
};

export type CountyMedicaidEnrollmentDataset = {
  id: string;
  label: string;
  description: string;
  vintage: string;
  period: string;
  survey: string;
  table: string;
  universe: string;
  source: {label: string; url: string};
  caveat: string;
  counties: ReadonlyMap<string, CountyMedicaidEnrollment>;
};

type CountyMedicaidEnrollmentFile = Omit<
  CountyMedicaidEnrollmentDataset,
  'counties'
> & {
  counties: Record<string, CountyMedicaidEnrollment>;
};

export async function loadCountyMedicaidEnrollment(
  signal?: AbortSignal,
): Promise<CountyMedicaidEnrollmentDataset> {
  const response = await fetch('/data/county-medicaid-enrollment-2024.json', {
    signal,
  });
  if (!response.ok) {
    throw new Error(
      `Could not load county Medicaid enrollment (${response.status})`,
    );
  }
  const file = (await response.json()) as CountyMedicaidEnrollmentFile;
  return {...file, counties: new Map(Object.entries(file.counties))};
}

export function createMedicaidEnrollmentMetric(
  enrollment: CountyMedicaidEnrollmentDataset,
): CountyMetric {
  return {
    id: enrollment.id,
    label: enrollment.label,
    description:
      `${enrollment.description}; ${enrollment.vintage} ACS 5-year estimate ` +
      `covering ${enrollment.period}`,
    vintage: enrollment.vintage,
    source: enrollment.source,
    scale: 'log',
    values: new Map(
      [...enrollment.counties].map(([geoid, county]) => [
        geoid,
        county.enrolled,
      ]),
    ),
    formatValue: formatEnrollmentCount,
  };
}

export function createMedicaidEnrollmentPercentMetric(
  enrollment: CountyMedicaidEnrollmentDataset,
): CountyMetric {
  return {
    id: `${enrollment.id}-percent`,
    label: 'Estimated Medicaid coverage rate',
    description:
      `Estimated share of the civilian noninstitutionalized population with ` +
      `Medicaid or other means-tested public coverage; ${enrollment.vintage} ` +
      `ACS 5-year estimate covering ${enrollment.period}`,
    vintage: enrollment.vintage,
    source: enrollment.source,
    scale: 'quantile',
    values: new Map(
      [...enrollment.counties].map(([geoid, county]) => [
        geoid,
        county.enrollmentPercent,
      ]),
    ),
    formatValue: (value) => `${value.toFixed(1)}%`,
  };
}

export function formatEnrollmentCount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}
