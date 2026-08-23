import {describe, expect, it} from 'vitest';
import ppp from '../../public/data/county-ppp.json';

describe('county PPP artifact', () => {
  const counties = Object.values(ppp.counties);

  it('contains near-complete county coverage and reconciled national totals', () => {
    expect(counties.length).toBeGreaterThan(3_200);
    expect(counties.every((county) => county.loans > 0)).toBe(true);
    expect(counties.reduce((sum, county) => sum + county.loans, 0)).toBe(
      11_467_137,
    );
  });

  it('contains nonnegative approved, forgiveness, and jobs values', () => {
    for (const county of counties) {
      expect(county.approved).toBeGreaterThanOrEqual(0);
      expect(county.forgiven).toBeGreaterThanOrEqual(0);
      expect(county.jobs).toBeGreaterThanOrEqual(0);
    }
  });

  it('reconciles owner gender, ethnicity, and race counts to loan totals', () => {
    for (const county of counties) {
      const owner = county.owners;
      expect(owner.male + owner.female + owner.genderUnanswered).toBe(
        county.loans,
      );
      expect(
        owner.hispanic + owner.notHispanic + owner.ethnicityUnanswered,
      ).toBe(county.loans);
      expect(
        owner.white +
          owner.black +
          owner.native +
          owner.asian +
          owner.pacificIslander +
          owner.multiracial +
          owner.otherRace +
          owner.raceUnanswered,
      ).toBe(county.loans);
    }
  });
});
