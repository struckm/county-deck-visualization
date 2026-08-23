import type {
  CountyDemographics,
  CountyDemographicsDataset,
} from './loadDemographics';
import type {Color, CountyCategoryOverlay} from '../map/types';

const GROUPS: ReadonlyArray<{
  id: keyof Omit<CountyDemographics, 'total' | 'male' | 'female'>;
  label: string;
  color: Color;
}> = [
  {id: 'hispanic', label: 'Hispanic / Latino', color: [252, 141, 98, 245]},
  {
    id: 'whiteNonHispanic',
    label: 'White, non-Hispanic',
    color: [141, 160, 203, 245],
  },
  {
    id: 'blackNonHispanic',
    label: 'Black, non-Hispanic',
    color: [231, 138, 195, 245],
  },
  {
    id: 'nativeNonHispanic',
    label: 'American Indian / Alaska Native',
    color: [102, 194, 165, 245],
  },
  {
    id: 'asianNonHispanic',
    label: 'Asian, non-Hispanic',
    color: [255, 217, 47, 245],
  },
  {
    id: 'pacificIslanderNonHispanic',
    label: 'Native Hawaiian / Pacific Islander',
    color: [166, 216, 84, 245],
  },
  {
    id: 'multiracialNonHispanic',
    label: 'Two or more races, non-Hispanic',
    color: [229, 196, 148, 245],
  },
];

export function createEthnicityOverlay(
  demographics: CountyDemographicsDataset,
): CountyCategoryOverlay {
  const values = new Map<string, string>();
  const counts = new Map(GROUPS.map(({id}) => [id, 0]));

  for (const [geoid, county] of demographics.counties) {
    const largest = GROUPS.reduce((current, candidate) =>
      county[candidate.id] > county[current.id] ? candidate : current,
    );
    values.set(geoid, largest.id);
    counts.set(largest.id, (counts.get(largest.id) ?? 0) + 1);
  }

  return {
    id: 'race-ethnicity-majority',
    metricId: 'population-2024',
    label: 'Largest race & ethnicity group',
    description:
      'The largest mutually exclusive race or ethnicity group in each county; the group does not need to exceed 50%',
    vintage: demographics.vintage,
    source: demographics.source,
    categories: GROUPS.filter(({id}) => (counts.get(id) ?? 0) > 0).map(
      ({id, label, color}) => ({
        id,
        label,
        color,
        countyCount: counts.get(id) ?? 0,
      }),
    ),
    values,
  };
}
