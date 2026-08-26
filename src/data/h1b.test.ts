import {describe, expect, it} from 'vitest';
import h1b from '../../public/data/county-h1b-fy2025.json';

describe('county FY2025 H-1B artifact', () => {
  const counties = Object.values(h1b.counties);

  it('contains broad worksite coverage and reconciles mapped certified placements', () => {
    expect(counties.length).toBe(2_545);
    expect(
      counties.reduce(
        (sum, county) => sum + county.certifiedWorkerPlacements,
        0,
      ),
    ).toBe(1_242_597);
  });

  it('contains internally consistent nonnegative application and placement totals', () => {
    for (const county of counties) {
      expect(county.certifiedApplications).toBeLessThanOrEqual(
        county.applications,
      );
      expect(county.certifiedWorkerPlacements).toBeLessThanOrEqual(
        county.allWorkerPlacements,
      );
      expect(county.fullTimeWorkerPlacements).toBeLessThanOrEqual(
        county.certifiedWorkerPlacements,
      );
      expect(county.secondaryEntityWorkerPlacements).toBeLessThanOrEqual(
        county.certifiedWorkerPlacements,
      );
      expect(county.averageOfferedAnnualWage ?? 0).toBeGreaterThanOrEqual(0);
      expect(county.averagePrevailingAnnualWage ?? 0).toBeGreaterThanOrEqual(0);
    }
  });

  it('limits popup rankings to five employers and occupations', () => {
    for (const county of counties) {
      expect(county.topEmployers.length).toBeLessThanOrEqual(5);
      expect(county.topOccupations.length).toBeLessThanOrEqual(5);
    }
  });
});
