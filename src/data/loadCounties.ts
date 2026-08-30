import {feature} from 'topojson-client';
import type {GeometryCollection, Topology} from 'topojson-specification';
import type {
  CountyFeatureCollection,
  CountyProperties,
  StateFeatureCollection,
  StateProperties,
} from '../map/types';

const MAP_TOPOLOGY_URL = '/data/us-counties-states-2023.topojson';

type MapTopology = Topology<{
  counties: GeometryCollection<CountyProperties>;
  states: GeometryCollection<StateProperties>;
}>;

export async function loadMapGeometry(signal?: AbortSignal): Promise<{
  counties: CountyFeatureCollection;
  states: StateFeatureCollection;
}> {
  const response = await fetch(MAP_TOPOLOGY_URL, {signal});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const mapTopology = (await response.json()) as MapTopology;

  return {
    counties: feature(
      mapTopology,
      mapTopology.objects.counties,
    ) as CountyFeatureCollection,
    states: feature(
      mapTopology,
      mapTopology.objects.states,
    ) as StateFeatureCollection,
  };
}
