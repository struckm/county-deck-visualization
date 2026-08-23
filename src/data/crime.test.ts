import {describe, expect, it} from 'vitest';
import crime from '../../public/data/county-crime-2025.json';

describe('county crime artifact', () => {
  const counties = Object.values(crime.counties);

  it('contains broad county coverage and positive reported offense totals', () => {
    expect(counties.length).toBeGreaterThan(2_900);
    expect(counties.every((county) => county.offenses > 0)).toBe(true);
  });

  it('reconciles offender sex, ethnicity, and race counts', () => {
    for (const county of counties) {
      const offender = county.offenders;
      expect(offender.male + offender.female + offender.sexUnknown).toBe(
        offender.total,
      );
      expect(
        offender.hispanic +
          offender.notHispanic +
          offender.ethnicityMultiple +
          offender.ethnicityUnknown,
      ).toBe(offender.total);
      expect(
        offender.white +
          offender.black +
          offender.native +
          offender.asian +
          offender.pacificIslander +
          offender.multiracial +
          offender.raceUnknown,
      ).toBe(offender.total);
    }
  });
});
