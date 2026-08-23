import type {CountyCrimeDataset, CountyCrimeOffenders} from './loadCrime';
import type {Color, CountyCategoryOverlay} from '../map/types';

const RACES: ReadonlyArray<{
  id: keyof Pick<
    CountyCrimeOffenders,
    'white' | 'black' | 'native' | 'asian' | 'pacificIslander' | 'multiracial'
  >;
  label: string;
  color: Color;
}> = [
  {id: 'white', label: 'White', color: [141, 160, 203, 245]},
  {id: 'black', label: 'Black / African American', color: [231, 138, 195, 245]},
  {
    id: 'native',
    label: 'American Indian / Alaska Native',
    color: [102, 194, 165, 245],
  },
  {id: 'asian', label: 'Asian', color: [255, 217, 47, 245]},
  {
    id: 'pacificIslander',
    label: 'Native Hawaiian / Pacific Islander',
    color: [166, 216, 84, 245],
  },
  {id: 'multiracial', label: 'Multiple races', color: [229, 196, 148, 245]},
];

export function createCrimeRaceOverlay(
  crime: CountyCrimeDataset,
): CountyCategoryOverlay {
  const values = new Map<string, string>();
  const counts = new Map(RACES.map(({id}) => [id, 0]));

  for (const [geoid, county] of crime.counties) {
    const knownRaceTotal = RACES.reduce(
      (total, race) => total + county.offenders[race.id],
      0,
    );
    if (knownRaceTotal === 0) continue;
    const largest = RACES.reduce((current, candidate) =>
      county.offenders[candidate.id] > county.offenders[current.id]
        ? candidate
        : current,
    );
    values.set(geoid, largest.id);
    counts.set(largest.id, (counts.get(largest.id) ?? 0) + 1);
  }

  return {
    id: 'crime-known-offender-race-majority',
    metricId: crime.id,
    label: 'Largest known-offender race',
    description:
      'The largest reported race among known-offender records in each county; unknown and not-specified race values are excluded, and the group does not need to exceed 50%',
    vintage: crime.vintage,
    source: crime.source,
    categories: RACES.filter(({id}) => (counts.get(id) ?? 0) > 0).map(
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
