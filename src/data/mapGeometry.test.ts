import {feature} from 'topojson-client';
import type {GeometryCollection, Topology} from 'topojson-specification';
import {describe, expect, it} from 'vitest';
import topologyRaw from '../../public/data/us-counties-states-2023.topojson?raw';
import type {CountyProperties, StateProperties} from '../map/types';

const mapTopology = JSON.parse(topologyRaw) as Topology<{
  counties: GeometryCollection<CountyProperties>;
  states: GeometryCollection<StateProperties>;
}>;
const counties = feature(mapTopology, mapTopology.objects.counties);
const states = feature(mapTopology, mapTopology.objects.states);

describe('combined map topology', () => {
  it('retains every county and state feature', () => {
    expect(counties.features).toHaveLength(3_235);
    expect(states.features).toHaveLength(56);
    expect(
      new Set(counties.features.map(({properties}) => properties.GEOID)).size,
    ).toBe(3_235);
  });

  it('decodes polygon geometry and the properties used by the map', () => {
    for (const county of counties.features) {
      expect(['Polygon', 'MultiPolygon']).toContain(county.geometry.type);
      expect(county.properties.GEOID).toMatch(/^\d{5}$/);
      expect(county.properties.STUSPS).toMatch(/^[A-Z]{2}$/);
    }
    for (const state of states.features) {
      expect(['Polygon', 'MultiPolygon']).toContain(state.geometry.type);
      expect(state.properties.STATEFP).toMatch(/^\d{2}$/);
      expect(state.properties.STUSPS).toMatch(/^[A-Z]{2}$/);
    }
  });
});
