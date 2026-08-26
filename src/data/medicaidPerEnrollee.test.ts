import {describe, expect, it} from 'vitest';
import medicaidFile from '../../public/data/county-medicaid-2024.json';
import enrollmentFile from '../../public/data/county-medicaid-enrollment-2024.json';
import {createMedicaidPerEnrolleeMetric} from './loadMedicaid';

const medicaid = {
  ...medicaidFile,
  counties: new Map(Object.entries(medicaidFile.counties)),
};
const enrollment = {
  ...enrollmentFile,
  counties: new Map(Object.entries(enrollmentFile.counties)),
};

describe('Medicaid paid per estimated enrollee metric', () => {
  it('divides county-attributed payments by estimated covered residents', () => {
    const metric = createMedicaidPerEnrolleeMetric(medicaid, enrollment);
    const geoid = '17031';
    expect(metric.values.get(geoid)).toBeCloseTo(
      medicaid.counties.get(geoid)!.paid /
        enrollment.counties.get(geoid)!.enrolled,
    );
    expect(metric.label).toBe('Medicaid paid per estimated enrollee');
  });

  it('returns no value when an enrollment denominator is unavailable', () => {
    const metric = createMedicaidPerEnrolleeMetric(medicaid, {
      ...enrollment,
      counties: new Map(),
    });
    expect(metric.values.get('17031')).toBeNull();
  });
});
