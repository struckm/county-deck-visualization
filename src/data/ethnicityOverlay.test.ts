import {describe, expect, it} from 'vitest';
import demographics from '../../public/data/county-demographics-2024.json';
import {createEthnicityOverlay} from './ethnicityOverlay';

const overlay = createEthnicityOverlay({
  ...demographics,
  counties: new Map(Object.entries(demographics.counties)),
});

describe('createEthnicityOverlay', () => {
  it('assigns every covered county to its largest group', () => {
    expect(overlay.values.size).toBe(3_144);
    expect(overlay.values.get('17031')).toBe('whiteNonHispanic');
  });

  it('only exposes groups that lead in at least one county', () => {
    expect(
      Object.fromEntries(
        overlay.categories.map(({id, countyCount}) => [id, countyCount]),
      ),
    ).toEqual({
      hispanic: 143,
      whiteNonHispanic: 2_834,
      blackNonHispanic: 128,
      nativeNonHispanic: 32,
      asianNonHispanic: 6,
      pacificIslanderNonHispanic: 1,
    });
  });
});
