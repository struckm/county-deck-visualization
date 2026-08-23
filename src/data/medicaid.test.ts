import {describe, expect, it} from 'vitest';
import medicaid from '../../public/data/county-medicaid-2024.json';

describe('county Medicaid artifact', () => {
  const counties = Object.values(medicaid.counties);

  it('contains broad county coverage and substantial attributed spending', () => {
    expect(counties.length).toBeGreaterThan(3_100);
    expect(counties.reduce((sum, county) => sum + county.paid, 0)).toBeGreaterThan(
      190_000_000_000,
    );
  });

  it('contains internally valid provider activity totals', () => {
    for (const county of counties) {
      expect(county.providers).toBeGreaterThan(0);
      expect(county.claimLines).toBeGreaterThan(0);
      expect(county.serviceCells).toBeGreaterThan(0);
      expect(county.adjustmentCells).toBeGreaterThanOrEqual(0);
      expect(county.adjustmentCells).toBeLessThanOrEqual(county.serviceCells);
    }
  });
});
