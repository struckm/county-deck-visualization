import {describe, expect, it} from 'vitest';
import {getCountyBounds} from './geoBounds';
import type {CountyFeature} from './types';

const properties = {
  GEOID: '00000',
  NAME: 'Example',
  NAMELSAD: 'Example County',
  STUSPS: 'EX',
  STATE_NAME: 'Example',
  ALAND: 0,
  AWATER: 0,
};

describe('getCountyBounds', () => {
  it('returns the extent of a polygon', () => {
    const county: CountyFeature = {
      type: 'Feature',
      properties,
      geometry: {
        type: 'Polygon',
        coordinates: [[[-91, 38], [-89, 38], [-89, 41], [-91, 38]]],
      },
    };
    expect(getCountyBounds(county)).toEqual([[-91, 38], [-89, 41]]);
  });

  it('uses the short extent for geometry crossing the antimeridian', () => {
    const county: CountyFeature = {
      type: 'Feature',
      properties,
      geometry: {
        type: 'Polygon',
        coordinates: [[[179, 51], [-179, 51], [-179, 53], [179, 51]]],
      },
    };
    const [[west], [east]] = getCountyBounds(county);
    expect(east - west).toBe(2);
  });
});
