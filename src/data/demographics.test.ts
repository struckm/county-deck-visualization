import {describe, expect, it} from 'vitest';
import demographics from '../../public/data/county-demographics-2024.json';

describe('county demographics artifact', () => {
  const counties = Object.values(demographics.counties);

  it('contains all counties covered by the Census estimates', () => {
    expect(counties).toHaveLength(3_144);
  });

  it('reconciles sex and race/ethnicity groups to county totals', () => {
    for (const county of counties) {
      expect(county.male + county.female).toBe(county.total);
      expect(
        county.hispanic +
          county.whiteNonHispanic +
          county.blackNonHispanic +
          county.nativeNonHispanic +
          county.asianNonHispanic +
          county.pacificIslanderNonHispanic +
          county.multiracialNonHispanic,
      ).toBe(county.total);
    }
  });
});
