import {describe, expect, it} from 'vitest';
import statesRaw from '../../public/data/us-states-2023.geojson?raw';

const states = JSON.parse(statesRaw) as {
  features: Array<{
    properties: {STATEFP: string; STUSPS: string; NAME: string};
    geometry: {type: string};
  }>;
};

describe('state boundary artifact', () => {
  it('contains the states, District of Columbia, and populated territories', () => {
    expect(states.features).toHaveLength(56);
    expect(states.features.map(({properties}) => properties.STUSPS)).toContain(
      'DC',
    );
    expect(states.features.map(({properties}) => properties.STUSPS)).toContain(
      'PR',
    );
  });

  it('contains polygon geometry and state identifiers', () => {
    for (const feature of states.features) {
      expect(['Polygon', 'MultiPolygon']).toContain(feature.geometry.type);
      expect(feature.properties.STATEFP).toMatch(/^\d{2}$/);
      expect(feature.properties.STUSPS).toMatch(/^[A-Z]{2}$/);
      expect(feature.properties.NAME.length).toBeGreaterThan(0);
    }
  });
});
