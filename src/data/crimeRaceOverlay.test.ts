import {describe, expect, it} from 'vitest';
import crime from '../../public/data/county-crime-2025.json';
import {createCrimeRaceOverlay} from './crimeRaceOverlay';

const overlay = createCrimeRaceOverlay({
  ...crime,
  counties: new Map(Object.entries(crime.counties)),
});

describe('createCrimeRaceOverlay', () => {
  it('assigns counties with at least one reported known race', () => {
    expect(overlay.values.size).toBe(2_978);
    expect(overlay.values.get('17031')).toBe('black');
    expect(overlay.values.get('06037')).toBe('white');
  });

  it('excludes unknown race from the leading category', () => {
    expect(
      Object.fromEntries(
        overlay.categories.map(({id, countyCount}) => [id, countyCount]),
      ),
    ).toEqual({
      white: 2_536,
      black: 406,
      native: 32,
      pacificIslander: 4,
    });
  });
});
