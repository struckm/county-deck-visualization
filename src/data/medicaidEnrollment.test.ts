import {describe, expect, it} from 'vitest';
import enrollment from '../../public/data/county-medicaid-enrollment-2024.json';
import {
  createMedicaidEnrollmentMetric,
  createMedicaidEnrollmentPercentMetric,
} from './loadMedicaidEnrollment';

const dataset = {
  ...enrollment,
  counties: new Map(Object.entries(enrollment.counties)),
};

describe('county Medicaid enrollment artifact', () => {
  const counties = Object.values(enrollment.counties);

  it('identifies the source, period, and survey universe', () => {
    expect(enrollment.vintage).toBe('2024');
    expect(enrollment.period).toBe('2020-2024');
    expect(enrollment.table).toBe('C27007');
    expect(enrollment.universe).toBe('Civilian noninstitutionalized population');
  });

  it('contains nationwide county coverage and a plausible enrollment total', () => {
    expect(counties).toHaveLength(3_222);
    expect(counties.reduce((sum, county) => sum + county.enrolled, 0)).toBe(
      70_401_089,
    );
  });

  it('contains internally consistent estimates and margins of error', () => {
    for (const county of counties) {
      expect(county.enrolled).toBe(
        county.under19 + county.age19To64 + county.age65Plus,
      );
      expect(county.enrolled).toBeGreaterThanOrEqual(0);
      expect(county.enrolled).toBeLessThanOrEqual(county.population);
      expect(county.enrolledMoe).toBeGreaterThanOrEqual(0);
      expect(county.enrollmentPercent).toBeGreaterThanOrEqual(0);
      expect(county.enrollmentPercent).toBeLessThanOrEqual(100);
    }
  });

  it('creates count and coverage-rate map metrics', () => {
    const countMetric = createMedicaidEnrollmentMetric(dataset);
    const rateMetric = createMedicaidEnrollmentPercentMetric(dataset);
    expect(countMetric.values.get('17031')).toBe(1_117_496);
    expect(countMetric.formatValue(1_117_496)).toBe('1,117,496');
    expect(rateMetric.values.get('17031')).toBe(21.76);
    expect(rateMetric.formatValue(21.76)).toBe('21.8%');
  });
});
