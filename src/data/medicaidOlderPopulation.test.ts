import {describe, expect, it} from 'vitest';
import demographicsFile from '../../public/data/county-demographics-2024.json';
import medicaidFile from '../../public/data/county-medicaid-2024.json';
import {createMedicaidPerOlderResidentMetric} from './loadMedicaid';

const demographics = {
  ...demographicsFile,
  counties: new Map(Object.entries(demographicsFile.counties)),
};
const medicaid = {
  ...medicaidFile,
  counties: new Map(Object.entries(medicaidFile.counties)),
};
const metric = createMedicaidPerOlderResidentMetric(medicaid, demographics);

describe('Medicaid paid per resident age 65+ metric', () => {
  it('normalizes counties covered by both sources and preserves no-data values', () => {
    expect(metric.values.size).toBe(3_143);
    const values = [...metric.values.values()];
    expect(values.filter((value) => value != null)).toHaveLength(3_060);
    expect(values.filter((value) => value == null)).toHaveLength(83);
  });

  it('divides provider payments by the resident age-65+ population', () => {
    const geoid = '17031';
    expect(metric.values.get(geoid)).toBeCloseTo(
      medicaid.counties.get(geoid)!.paid /
        demographics.counties.get(geoid)!.age65Plus,
    );
  });
});
